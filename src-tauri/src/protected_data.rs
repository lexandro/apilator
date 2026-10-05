use base64::Engine;

/// Request credentials (basic password, bearer token, JWT secret) are written to disk
/// encrypted with DPAPI for the current Windows user. Unlike the credential store there is
/// no size limit, which matters for bearer tokens, and nothing to clean up when a tab or a
/// history entry goes away.
#[tauri::command]
pub fn protect_values(values: Vec<String>) -> Result<Vec<String>, String> {
    values
        .iter()
        .map(|value| {
            backend::protect(value.as_bytes())
                .map(|sealed| base64::engine::general_purpose::STANDARD.encode(sealed))
        })
        .collect()
}

/// A value that cannot be decrypted — written by another Windows user or machine, or
/// damaged — comes back as None rather than failing the whole batch.
#[tauri::command]
pub fn unprotect_values(values: Vec<String>) -> Vec<Option<String>> {
    values.iter().map(|value| unprotect_one(value)).collect()
}

fn unprotect_one(value: &str) -> Option<String> {
    let sealed = base64::engine::general_purpose::STANDARD.decode(value).ok()?;
    let plain = backend::unprotect(&sealed).ok()?;
    String::from_utf8(plain).ok()
}

#[cfg(windows)]
mod backend {
    use std::ptr;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    /// Ties the ciphertext to this app, so another program decrypting DPAPI blobs for the
    /// same user has to know to ask for it.
    const ENTROPY: &[u8] = b"Apilator request credentials";

    fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        }
    }

    /// Copies a DPAPI output buffer and releases it; DPAPI allocates it with LocalAlloc.
    unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
        let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        LocalFree(out.pbData as _);
        bytes
    }

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(plain);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };

        // SAFETY: input and entropy point at live slices for the duration of the call, and
        // out is only read after DPAPI reports success.
        let ok = unsafe {
            CryptProtectData(
                &input,
                ptr::null(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 {
            return Err(format!(
                "Failed to protect a value: {}",
                std::io::Error::last_os_error()
            ));
        }

        Ok(unsafe { take(out) })
    }

    pub fn unprotect(sealed: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(sealed);
        let entropy = blob(ENTROPY);
        let mut out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: ptr::null_mut(),
        };

        // SAFETY: as in protect.
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                &entropy,
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
        };
        if ok == 0 {
            return Err(format!(
                "Failed to unprotect a value: {}",
                std::io::Error::last_os_error()
            ));
        }

        Ok(unsafe { take(out) })
    }
}

#[cfg(not(windows))]
mod backend {
    const UNSUPPORTED: &str = "No data protection is wired up for this platform";

    pub fn protect(_plain: &[u8]) -> Result<Vec<u8>, String> {
        Err(UNSUPPORTED.to_string())
    }

    pub fn unprotect(_sealed: &[u8]) -> Result<Vec<u8>, String> {
        Err(UNSUPPORTED.to_string())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    fn seal(value: &str) -> String {
        protect_values(vec![value.to_string()]).unwrap().remove(0)
    }

    #[test]
    fn a_value_round_trips() {
        let sealed = seal("s3cret-p@ss");
        assert_eq!(unprotect_values(vec![sealed]), vec![Some("s3cret-p@ss".to_string())]);
    }

    #[test]
    fn the_sealed_form_does_not_contain_the_value() {
        let sealed = seal("PLAINTEXT-MARKER");
        let bytes = base64::engine::general_purpose::STANDARD.decode(&sealed).unwrap();

        assert!(!sealed.contains("PLAINTEXT-MARKER"));
        assert!(!bytes.windows(16).any(|w| w == b"PLAINTEXT-MARKER"));
    }

    #[test]
    fn a_long_token_round_trips() {
        // Longer than the 2560-byte credential store limit, which is why this is not keyring.
        let token = "x".repeat(8000);
        assert_eq!(unprotect_values(vec![seal(&token)]), vec![Some(token)]);
    }

    #[test]
    fn a_batch_keeps_its_order() {
        let sealed = protect_values(vec!["a".into(), "b".into(), "c".into()]).unwrap();
        let opened: Vec<_> = unprotect_values(sealed).into_iter().flatten().collect();
        assert_eq!(opened, vec!["a", "b", "c"]);
    }

    #[test]
    fn a_damaged_value_comes_back_as_none_without_failing_the_batch() {
        let good = seal("fine");
        let mut bytes = base64::engine::general_purpose::STANDARD.decode(seal("x")).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        let damaged = base64::engine::general_purpose::STANDARD.encode(bytes);

        assert_eq!(
            unprotect_values(vec![damaged, "not base64!".into(), good]),
            vec![None, None, Some("fine".to_string())]
        );
    }

    #[test]
    fn a_value_sealed_without_the_app_entropy_is_rejected() {
        let mut out = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let data = b"other-app";
        let input = windows_sys::Win32::Security::Cryptography::CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let ok = unsafe {
            windows_sys::Win32::Security::Cryptography::CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                &mut out,
            )
        };
        assert_ne!(ok, 0);
        let foreign = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize) };
        let encoded = base64::engine::general_purpose::STANDARD.encode(foreign);

        assert_eq!(unprotect_values(vec![encoded]), vec![None]);
    }
}
