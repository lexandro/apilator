/// Resolves the proxy Windows is configured to use, so credentials can be attached to it.
/// reqwest picks up the system proxy on its own but gives no way to add authentication,
/// which is what the "Default proxy authentication" setting needs.
#[cfg(windows)]
pub fn system_proxy_url() -> Option<String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let settings = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        .ok()?;

    let enabled: u32 = settings.get_value("ProxyEnable").ok()?;
    if enabled == 0 {
        return None;
    }

    let server: String = settings.get_value("ProxyServer").ok()?;
    normalize_proxy_server(&server)
}

#[cfg(not(windows))]
pub fn system_proxy_url() -> Option<String> {
    for key in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Ok(value) = std::env::var(key) {
            if let Some(url) = normalize_proxy_server(&value) {
                return Some(url);
            }
        }
    }
    None
}

/// Windows stores either "host:port" or a per-protocol list such as
/// "http=host:80;https=host:443". Prefer https, fall back to the bare form.
pub fn normalize_proxy_server(server: &str) -> Option<String> {
    let server = server.trim();
    if server.is_empty() {
        return None;
    }

    if !server.contains('=') {
        return Some(with_scheme(server));
    }

    let entries: Vec<(&str, &str)> = server
        .split(';')
        .filter_map(|part| part.split_once('='))
        .map(|(k, v)| (k.trim(), v.trim()))
        .filter(|(_, v)| !v.is_empty())
        .collect();

    for wanted in ["https", "http"] {
        if let Some((_, value)) = entries.iter().find(|(k, _)| k.eq_ignore_ascii_case(wanted)) {
            return Some(with_scheme(value));
        }
    }

    entries.first().map(|(_, value)| with_scheme(value))
}

fn with_scheme(host_port: &str) -> String {
    if host_port.contains("://") {
        host_port.to_string()
    } else {
        format!("http://{}", host_port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bare_host_port_gets_a_scheme() {
        assert_eq!(
            normalize_proxy_server("proxy.corp:8080"),
            Some("http://proxy.corp:8080".to_string())
        );
    }

    #[test]
    fn an_existing_scheme_is_kept() {
        assert_eq!(
            normalize_proxy_server("http://proxy.corp:8080"),
            Some("http://proxy.corp:8080".to_string())
        );
    }

    #[test]
    fn https_wins_in_a_per_protocol_list() {
        assert_eq!(
            normalize_proxy_server("http=a.corp:80;https=b.corp:443"),
            Some("http://b.corp:443".to_string())
        );
    }

    #[test]
    fn http_is_used_when_there_is_no_https_entry() {
        assert_eq!(
            normalize_proxy_server("ftp=f.corp:21;http=a.corp:80"),
            Some("http://a.corp:80".to_string())
        );
    }

    #[test]
    fn an_unknown_protocol_is_still_better_than_nothing() {
        assert_eq!(
            normalize_proxy_server("socks=s.corp:1080"),
            Some("http://s.corp:1080".to_string())
        );
    }

    #[test]
    fn casing_does_not_matter() {
        assert_eq!(
            normalize_proxy_server("HTTPS=b.corp:443"),
            Some("http://b.corp:443".to_string())
        );
    }

    #[test]
    fn blank_and_empty_entries_yield_nothing() {
        assert_eq!(normalize_proxy_server(""), None);
        assert_eq!(normalize_proxy_server("   "), None);
        assert_eq!(normalize_proxy_server("http=;https="), None);
    }

    #[test]
    fn reading_the_system_proxy_never_panics() {
        let _ = system_proxy_url();
    }
}
