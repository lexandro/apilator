const MAX_KEY_LEN: usize = 64;

/// Keys arrive over IPC and become credential-store entry names, so they are restricted
/// to a fixed alphabet rather than trusted.
fn sanitize_key(key: &str) -> Result<String, String> {
    let cleaned: String = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_' || *c == '.')
        .take(MAX_KEY_LEN)
        .collect();

    if cleaned.is_empty() {
        return Err("Secret key must contain at least one usable character".to_string());
    }

    Ok(cleaned)
}

#[cfg(windows)]
mod backend {
    use keyring::Entry;

    const SERVICE: &str = "Apilator";

    fn entry(key: &str) -> Result<Entry, String> {
        Entry::new(SERVICE, key).map_err(|e| format!("Credential store unavailable: {}", e))
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        entry(key)?
            .set_password(value)
            .map_err(|e| format!("Failed to store secret: {}", e))
    }

    pub fn get(key: &str) -> Result<Option<String>, String> {
        match entry(key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to read secret: {}", e)),
        }
    }

    pub fn delete(key: &str) -> Result<(), String> {
        match entry(key)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("Failed to delete secret: {}", e)),
        }
    }
}

#[cfg(not(windows))]
mod backend {
    const UNSUPPORTED: &str = "No OS credential store is wired up for this platform";

    pub fn set(_key: &str, _value: &str) -> Result<(), String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn get(_key: &str) -> Result<Option<String>, String> {
        Ok(None)
    }

    pub fn delete(_key: &str) -> Result<(), String> {
        Ok(())
    }
}

#[tauri::command]
pub fn set_secret(key: String, value: String) -> Result<(), String> {
    let key = sanitize_key(&key)?;

    if value.is_empty() {
        return backend::delete(&key);
    }

    backend::set(&key, &value)
}

#[tauri::command]
pub fn get_secret(key: String) -> Result<Option<String>, String> {
    backend::get(&sanitize_key(&key)?)
}

#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    backend::delete(&sanitize_key(&key)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_key_keeps_the_allowed_alphabet() {
        assert_eq!(sanitize_key("proxy.custom_password-1"), Ok("proxy.custom_password-1".to_string()));
    }

    #[test]
    fn sanitize_key_strips_separators_and_whitespace() {
        assert_eq!(sanitize_key("a/b\\c d"), Ok("abcd".to_string()));
        assert_eq!(sanitize_key("../../escape"), Ok("....escape".to_string()));
    }

    #[test]
    fn sanitize_key_rejects_input_with_nothing_usable() {
        assert!(sanitize_key("").is_err());
        assert!(sanitize_key("///").is_err());
    }

    #[test]
    fn sanitize_key_is_length_capped() {
        assert_eq!(sanitize_key(&"a".repeat(200)).map(|k| k.len()), Ok(MAX_KEY_LEN));
    }

    #[test]
    fn an_empty_value_is_treated_as_a_delete() {
        // Must not panic or error on a platform without a credential store; deleting a
        // key that was never set is a no-op everywhere.
        assert!(set_secret("apilator-test-empty".to_string(), String::new()).is_ok());
    }

    #[test]
    fn reading_an_unknown_key_yields_none_rather_than_an_error() {
        assert_eq!(get_secret("apilator-test-definitely-absent".to_string()), Ok(None));
    }

    #[cfg(windows)]
    #[test]
    fn secrets_round_trip_through_the_credential_store() {
        let key = "apilator-test-roundtrip".to_string();

        set_secret(key.clone(), "s3cret".to_string()).expect("store");
        assert_eq!(get_secret(key.clone()), Ok(Some("s3cret".to_string())));

        delete_secret(key.clone()).expect("delete");
        assert_eq!(get_secret(key), Ok(None));
    }
}
