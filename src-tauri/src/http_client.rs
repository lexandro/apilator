use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tokio::sync::oneshot;

#[derive(Debug, Deserialize, Clone)]
pub struct ProxyConfig {
    pub mode: String, // "none" | "system" | "env" | "custom"
    pub custom_proxy: Option<CustomProxyConfig>,
    pub system_proxy_auth: Option<ProxyAuth>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct CustomProxyConfig {
    pub url: String,
    pub use_for_http: bool,
    pub use_for_https: bool,
    pub username: Option<String>,
    pub password: Option<String>,
    pub bypass: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ProxyAuth {
    pub username: String,
    pub password: String,
}

/// One multipart field. `file_path` turns it into a file part; otherwise it is a plain
/// text field.
#[derive(Debug, Deserialize, Clone)]
pub struct FormPart {
    pub key: String,
    pub value: String,
    pub file_path: Option<String>,
    pub content_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SendRequestParams {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    /// When present the request is sent as multipart/form-data and `body` is ignored.
    pub form_data: Option<Vec<FormPart>>,
    pub timeout_ms: Option<u64>,
    pub proxy: Option<ProxyConfig>,
    /// Absent means verify. Turning this off has to be an explicit, deliberate choice.
    pub verify_tls: Option<bool>,
    /// Absent or 0 means no limit.
    pub max_response_bytes: Option<u64>,
    pub follow_redirects: Option<bool>,
    /// "HTTP/1.1" restricts the client to HTTP/1; anything else lets it negotiate.
    pub http_version: Option<String>,
    /// Lets the frontend cancel this request while it is in flight.
    pub request_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SendRequestResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    /// "utf8" when body is the decoded text, "base64" when the payload was not valid
    /// UTF-8 and body holds base64 of the raw bytes.
    pub body_encoding: String,
    pub size: usize,
    pub time: u64,
    pub http_version: String,
    pub remote_addr: Option<String>,
    pub tls_verified: bool,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub struct RequestError {
    pub message: String,
    pub error_type: String, // 'network' | 'timeout' | 'parse' | 'cancelled' | 'unknown'
    pub code: Option<String>,
}

impl RequestError {
    fn parse(message: String, code: &str) -> Self {
        RequestError {
            message,
            error_type: "parse".to_string(),
            code: Some(code.to_string()),
        }
    }
}

// ============================================================
// Client cache
// ============================================================

/// reqwest keeps its connection pool inside the Client, so building one per request meant
/// a fresh TCP connection and TLS handshake every time. Clients are cached by the settings
/// that affect how connections are made; the timeout is applied per request instead.
#[derive(Debug, Hash, PartialEq, Eq, Clone)]
struct ClientKey {
    verify_tls: bool,
    follow_redirects: bool,
    http1_only: bool,
    proxy: String,
}

fn proxy_identity(proxy: &Option<ProxyConfig>) -> String {
    let Some(config) = proxy else {
        return "default".to_string();
    };

    match config.mode.as_str() {
        "custom" => match &config.custom_proxy {
            Some(custom) => format!(
                "custom|{}|{}|{}|{}|{}",
                custom.url,
                custom.use_for_http,
                custom.use_for_https,
                custom.username.as_deref().unwrap_or(""),
                custom.bypass.join(",")
            ),
            None => "custom|none".to_string(),
        },
        "system" => match &config.system_proxy_auth {
            Some(auth) => format!("system|{}", auth.username),
            None => "system".to_string(),
        },
        other => other.to_string(),
    }
}

fn client_cache() -> &'static Mutex<HashMap<ClientKey, reqwest::Client>> {
    static CACHE: OnceLock<Mutex<HashMap<ClientKey, reqwest::Client>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// How many clients were constructed per key. Counting per key rather than globally
/// keeps the assertion immune to whatever other requests happen to be in flight, and lets
/// the tests prove the pool is reused instead of assuming it.
fn build_counts() -> &'static Mutex<HashMap<ClientKey, usize>> {
    static COUNTS: OnceLock<Mutex<HashMap<ClientKey, usize>>> = OnceLock::new();
    COUNTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn build_client(
    key: &ClientKey,
    proxy: &Option<ProxyConfig>,
) -> Result<reqwest::Client, RequestError> {
    if let Ok(mut counts) = build_counts().lock() {
        *counts.entry(key.clone()).or_insert(0) += 1;
    }

    let mut builder = reqwest::Client::builder()
        .danger_accept_invalid_certs(!key.verify_tls)
        .gzip(true)
        .deflate(true)
        .brotli(true)
        .redirect(if key.follow_redirects {
            reqwest::redirect::Policy::limited(10)
        } else {
            reqwest::redirect::Policy::none()
        });

    if key.http1_only {
        builder = builder.http1_only();
    }

    if let Some(config) = proxy {
        match config.mode.as_str() {
            "none" => builder = builder.no_proxy(),
            "custom" => {
                if let Some(custom) = &config.custom_proxy {
                    builder = apply_custom_proxy(builder, custom)?;
                }
            }
            "system" => {
                if let Some(auth) = &config.system_proxy_auth {
                    builder = apply_system_proxy_auth(builder, auth);
                }
            }
            // "env" falls through to reqwest's default behaviour, which already reads the
            // *_PROXY variables.
            _ => {}
        }
    }

    builder.build().map_err(|e| RequestError {
        message: format!("Failed to create HTTP client: {}", e),
        error_type: "unknown".to_string(),
        code: None,
    })
}

fn apply_custom_proxy(
    builder: reqwest::ClientBuilder,
    custom: &CustomProxyConfig,
) -> Result<reqwest::ClientBuilder, RequestError> {
    let with_auth = |proxy: reqwest::Proxy| match (&custom.username, &custom.password) {
        (Some(username), Some(password)) if !username.is_empty() => {
            proxy.basic_auth(username, password)
        }
        _ => proxy,
    };

    let make = |proxy: Result<reqwest::Proxy, reqwest::Error>| {
        proxy
            .map_err(|e| RequestError::parse(format!("Invalid proxy URL: {}", e), "INVALID_PROXY_URL"))
            .map(with_auth)
    };

    let no_proxy = build_no_proxy(&custom.bypass);
    let with_bypass = |proxy: reqwest::Proxy| proxy.no_proxy(no_proxy.clone());

    let builder = match (custom.use_for_http, custom.use_for_https) {
        (true, true) => builder.proxy(with_bypass(make(reqwest::Proxy::all(&custom.url))?)),
        (true, false) => builder.proxy(with_bypass(make(reqwest::Proxy::http(&custom.url))?)),
        (false, true) => builder.proxy(with_bypass(make(reqwest::Proxy::https(&custom.url))?)),
        (false, false) => builder,
    };

    Ok(builder)
}

/// Turns the bypass list from settings into reqwest's NO_PROXY form. Returns None when the
/// list is empty, which means "no exceptions".
fn build_no_proxy(bypass: &[String]) -> Option<reqwest::NoProxy> {
    let joined = bypass
        .iter()
        .map(|entry| entry.trim())
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>()
        .join(",");

    if joined.is_empty() {
        return None;
    }

    reqwest::NoProxy::from_string(&joined)
}

/// The system proxy with credentials attached. reqwest finds the system proxy on its own
/// but offers no way to authenticate against it, so it has to be built explicitly.
fn apply_system_proxy_auth(
    builder: reqwest::ClientBuilder,
    auth: &ProxyAuth,
) -> reqwest::ClientBuilder {
    let Some(url) = crate::system_proxy::system_proxy_url() else {
        return builder;
    };

    match reqwest::Proxy::all(&url) {
        Ok(proxy) => builder.proxy(proxy.basic_auth(&auth.username, &auth.password)),
        Err(_) => builder,
    }
}

fn get_client(
    proxy: &Option<ProxyConfig>,
    verify_tls: bool,
    follow_redirects: bool,
    http1_only: bool,
) -> Result<reqwest::Client, RequestError> {
    let key = ClientKey {
        verify_tls,
        follow_redirects,
        http1_only,
        proxy: proxy_identity(proxy),
    };

    if let Ok(cache) = client_cache().lock() {
        if let Some(client) = cache.get(&key) {
            return Ok(client.clone());
        }
    }

    let client = build_client(&key, proxy)?;

    if let Ok(mut cache) = client_cache().lock() {
        cache.insert(key, client.clone());
    }

    Ok(client)
}

// ============================================================
// Cancellation
// ============================================================

fn cancel_registry() -> &'static Mutex<HashMap<String, oneshot::Sender<()>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, oneshot::Sender<()>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

#[tauri::command]
pub fn cancel_request(request_id: String) -> Result<bool, String> {
    let sender = cancel_registry()
        .lock()
        .map_err(|_| "Cancel registry is poisoned".to_string())?
        .remove(&request_id);

    Ok(match sender {
        Some(sender) => sender.send(()).is_ok(),
        None => false,
    })
}

// ============================================================
// Request
// ============================================================

fn parse_method(method: &str) -> Result<reqwest::Method, RequestError> {
    match method.to_uppercase().as_str() {
        "GET" => Ok(reqwest::Method::GET),
        "POST" => Ok(reqwest::Method::POST),
        "PUT" => Ok(reqwest::Method::PUT),
        "PATCH" => Ok(reqwest::Method::PATCH),
        "DELETE" => Ok(reqwest::Method::DELETE),
        "HEAD" => Ok(reqwest::Method::HEAD),
        "OPTIONS" => Ok(reqwest::Method::OPTIONS),
        other => Err(RequestError::parse(
            format!("Unsupported HTTP method: {}", other),
            "INVALID_METHOD",
        )),
    }
}

fn build_header_map(headers: &HashMap<String, String>) -> Result<HeaderMap, RequestError> {
    let mut map = HeaderMap::new();

    for (key, value) in headers {
        let name = HeaderName::try_from(key.as_str()).map_err(|e| {
            RequestError::parse(
                format!("Invalid header name '{}': {}", key, e),
                "INVALID_HEADER_NAME",
            )
        })?;
        let value = HeaderValue::try_from(value.as_str()).map_err(|e| {
            RequestError::parse(
                format!("Invalid header value for '{}': {}", key, e),
                "INVALID_HEADER_VALUE",
            )
        })?;
        map.insert(name, value);
    }

    Ok(map)
}

fn classify(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "timeout"
    } else if error.is_connect() || error.is_request() {
        "network"
    } else {
        "unknown"
    }
}

/// Reads the body incrementally so an oversized response is stopped at the limit instead
/// of being pulled entirely into memory first.
async fn read_body(
    response: reqwest::Response,
    max_bytes: Option<u64>,
) -> Result<(Vec<u8>, bool), RequestError> {
    let limit = max_bytes.filter(|n| *n > 0);

    let mut buffer: Vec<u8> = Vec::new();
    let mut truncated = false;
    let mut response = response;

    loop {
        let chunk = response.chunk().await.map_err(|e| RequestError {
            message: format!("Failed to read response body: {}", e),
            error_type: classify(&e).to_string(),
            code: None,
        })?;

        let Some(chunk) = chunk else { break };

        if let Some(limit) = limit {
            let remaining = limit as usize - buffer.len().min(limit as usize);
            if chunk.len() >= remaining {
                buffer.extend_from_slice(&chunk[..remaining]);
                truncated = true;
                break;
            }
        }

        buffer.extend_from_slice(&chunk);
    }

    Ok((buffer, truncated))
}

/// Text responses stay text. Anything that is not valid UTF-8 is handed over as base64 so
/// the bytes survive; from_utf8_lossy used to corrupt binary payloads silently.
fn encode_body(bytes: Vec<u8>) -> (String, &'static str) {
    match String::from_utf8(bytes) {
        Ok(text) => (text, "utf8"),
        Err(e) => (
            base64::engine::general_purpose::STANDARD.encode(e.as_bytes()),
            "base64",
        ),
    }
}

const MAX_UPLOAD_BYTES: u64 = 100 * 1024 * 1024;

async fn build_multipart(parts: Vec<FormPart>) -> Result<reqwest::multipart::Form, RequestError> {
    let mut form = reqwest::multipart::Form::new();

    for part in parts {
        let Some(path) = part.file_path.filter(|p| !p.is_empty()) else {
            form = form.text(part.key, part.value);
            continue;
        };

        let path = std::path::PathBuf::from(&path);

        let metadata = tokio::fs::metadata(&path).await.map_err(|e| {
            RequestError::parse(
                format!("Cannot read {}: {}", path.display(), e),
                "FILE_NOT_READABLE",
            )
        })?;

        if metadata.len() > MAX_UPLOAD_BYTES {
            return Err(RequestError::parse(
                format!(
                    "{} is {} bytes, over the {} byte upload limit",
                    path.display(),
                    metadata.len(),
                    MAX_UPLOAD_BYTES
                ),
                "FILE_TOO_LARGE",
            ));
        }

        let bytes = tokio::fs::read(&path).await.map_err(|e| {
            RequestError::parse(
                format!("Cannot read {}: {}", path.display(), e),
                "FILE_NOT_READABLE",
            )
        })?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        let mut file_part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);

        if let Some(content_type) = part.content_type.filter(|c| !c.is_empty()) {
            file_part = file_part.mime_str(&content_type).map_err(|e| {
                RequestError::parse(
                    format!("Invalid content type '{}': {}", content_type, e),
                    "INVALID_CONTENT_TYPE",
                )
            })?;
        }

        form = form.part(part.key, file_part);
    }

    Ok(form)
}

async fn perform_request(params: SendRequestParams) -> Result<SendRequestResponse, RequestError> {
    let timeout_ms = params.timeout_ms.filter(|n| *n > 0);
    let verify_tls = params.verify_tls.unwrap_or(true);
    let follow_redirects = params.follow_redirects.unwrap_or(true);

    // Validate before touching the client cache, so a malformed request costs nothing.
    let method = parse_method(&params.method)?;
    let headers = build_header_map(&params.headers)?;

    let http1_only = params.http_version.as_deref() == Some("HTTP/1.1");
    let client = get_client(&params.proxy, verify_tls, follow_redirects, http1_only)?;
    let mut request = client.request(method, &params.url).headers(headers);

    if let Some(timeout_ms) = timeout_ms {
        request = request.timeout(std::time::Duration::from_millis(timeout_ms));
    }

    if let Some(parts) = params.form_data {
        request = request.multipart(build_multipart(parts).await?);
    } else if let Some(body) = params.body {
        request = request.body(body);
    }

    let start = Instant::now();

    let response = request.send().await.map_err(|e| RequestError {
        message: e.to_string(),
        error_type: classify(&e).to_string(),
        code: e.status().map(|s| s.as_u16().to_string()),
    })?;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("Unknown")
        .to_string();

    let http_version = match response.version() {
        reqwest::Version::HTTP_09 => "HTTP/0.9",
        reqwest::Version::HTTP_10 => "HTTP/1.0",
        reqwest::Version::HTTP_11 => "HTTP/1.1",
        reqwest::Version::HTTP_2 => "HTTP/2",
        reqwest::Version::HTTP_3 => "HTTP/3",
        _ => "Unknown",
    }
    .to_string();

    let remote_addr = response.remote_addr().map(|a| a.to_string());

    let mut response_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            response_headers.insert(key.to_string(), v.to_string());
        }
    }

    let (bytes, truncated) = read_body(response, params.max_response_bytes).await?;
    let elapsed = start.elapsed().as_millis() as u64;

    let size = bytes.len();
    let (body, body_encoding) = encode_body(bytes);

    Ok(SendRequestResponse {
        status,
        status_text,
        headers: response_headers,
        body,
        body_encoding: body_encoding.to_string(),
        size,
        time: elapsed,
        http_version,
        remote_addr,
        tls_verified: verify_tls,
        truncated,
    })
}

#[tauri::command]
pub async fn send_request(params: SendRequestParams) -> Result<SendRequestResponse, RequestError> {
    let Some(request_id) = params.request_id.clone() else {
        return perform_request(params).await;
    };

    let (sender, receiver) = oneshot::channel();

    if let Ok(mut registry) = cancel_registry().lock() {
        registry.insert(request_id.clone(), sender);
    }

    let result = tokio::select! {
        result = perform_request(params) => result,
        _ = receiver => Err(RequestError {
            message: "Request cancelled".to_string(),
            error_type: "cancelled".to_string(),
            code: None,
        }),
    };

    if let Ok(mut registry) = cancel_registry().lock() {
        registry.remove(&request_id);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(url: &str, verify_tls: bool) -> SendRequestParams {
        SendRequestParams {
            method: "GET".to_string(),
            url: url.to_string(),
            headers: HashMap::new(),
            body: None,
            form_data: None,
            timeout_ms: Some(15000),
            proxy: None,
            verify_tls: Some(verify_tls),
            max_response_bytes: None,
            follow_redirects: Some(true),
            http_version: None,
            request_id: None,
        }
    }

    #[test]
    fn methods_are_parsed_case_insensitively() {
        assert_eq!(parse_method("get").unwrap(), reqwest::Method::GET);
        assert_eq!(parse_method("PoSt").unwrap(), reqwest::Method::POST);
    }

    #[test]
    fn every_supported_method_parses() {
        for method in ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] {
            assert!(parse_method(method).is_ok(), "{} should parse", method);
        }
    }

    #[test]
    fn an_unknown_method_is_rejected() {
        let err = parse_method("BREW").unwrap_err();
        assert_eq!(err.code.as_deref(), Some("INVALID_METHOD"));
    }

    #[test]
    fn valid_headers_are_accepted() {
        let mut headers = HashMap::new();
        headers.insert("X-Test".to_string(), "value".to_string());
        assert!(build_header_map(&headers).is_ok());
    }

    #[test]
    fn an_invalid_header_name_is_rejected() {
        let mut headers = HashMap::new();
        headers.insert("bad header".to_string(), "value".to_string());
        assert_eq!(
            build_header_map(&headers).unwrap_err().code.as_deref(),
            Some("INVALID_HEADER_NAME")
        );
    }

    #[test]
    fn utf8_bodies_are_returned_as_text() {
        let (body, encoding) = encode_body("hello árvíztűrő".as_bytes().to_vec());
        assert_eq!(encoding, "utf8");
        assert_eq!(body, "hello árvíztűrő");
    }

    #[test]
    fn non_utf8_bodies_are_returned_as_base64_rather_than_corrupted() {
        // 0xFF is never valid UTF-8; from_utf8_lossy would turn it into U+FFFD.
        let (body, encoding) = encode_body(vec![0x00, 0xFF, 0xFE, 0x42]);
        assert_eq!(encoding, "base64");
        assert_eq!(
            base64::engine::general_purpose::STANDARD.decode(body).unwrap(),
            vec![0x00, 0xFF, 0xFE, 0x42]
        );
    }

    #[test]
    fn an_empty_body_is_valid_utf8() {
        let (body, encoding) = encode_body(vec![]);
        assert_eq!(encoding, "utf8");
        assert_eq!(body, "");
    }

    fn builds_for(key: &ClientKey) -> usize {
        build_counts().lock().unwrap().get(key).copied().unwrap_or(0)
    }

    fn forget(key: &ClientKey) {
        client_cache().lock().unwrap().remove(key);
        build_counts().lock().unwrap().remove(key);
    }

    fn unique_proxy(url: &str) -> Option<ProxyConfig> {
        Some(ProxyConfig {
            mode: "custom".to_string(),
            custom_proxy: Some(CustomProxyConfig {
                url: url.to_string(),
                use_for_http: true,
                use_for_https: true,
                username: None,
                password: None,
                bypass: vec![],
            }),
            system_proxy_auth: None,
        })
    }

    #[test]
    fn a_client_is_built_once_and_then_reused() {
        let proxy = unique_proxy("http://reuse-test.invalid:9999");
        let key = ClientKey {
            verify_tls: true,
            follow_redirects: true,
            http1_only: false,
            proxy: proxy_identity(&proxy),
        };
        forget(&key);

        get_client(&proxy, true, true, false).unwrap();
        assert_eq!(builds_for(&key), 1, "the first call must build exactly one client");

        get_client(&proxy, true, true, false).unwrap();
        get_client(&proxy, true, true, false).unwrap();
        assert_eq!(builds_for(&key), 1, "later calls must come from the cache");
        assert!(client_cache().lock().unwrap().contains_key(&key));

        forget(&key);
    }

    #[test]
    fn different_settings_get_their_own_client() {
        let proxy = unique_proxy("http://distinct-test.invalid:9999");
        let key_of = |verify| ClientKey {
            verify_tls: verify,
            follow_redirects: true,
            http1_only: false,
            proxy: proxy_identity(&proxy),
        };
        forget(&key_of(true));
        forget(&key_of(false));

        get_client(&proxy, true, true, false).unwrap();
        get_client(&proxy, false, true, false).unwrap();

        assert_eq!(builds_for(&key_of(true)), 1);
        assert_eq!(builds_for(&key_of(false)), 1, "verified and unverified must not share a pool");

        forget(&key_of(true));
        forget(&key_of(false));
    }

    #[test]
    fn get_client_returns_a_usable_client_for_every_proxy_mode() {
        for mode in ["none", "system", "env", "custom", "nonsense"] {
            let proxy = Some(ProxyConfig {
                mode: mode.to_string(),
                custom_proxy: (mode == "custom").then(|| CustomProxyConfig {
                    url: "http://proxy.test:8080".to_string(),
                    use_for_http: true,
                    use_for_https: true,
                    username: None,
                    password: None,
                    bypass: vec![],
                }),
                system_proxy_auth: None,
            });

            assert!(get_client(&proxy, true, true, false).is_ok(), "mode {} failed", mode);
        }
    }

    #[test]
    fn the_client_cache_separates_verified_from_unverified() {
        let key_verified = ClientKey {
            verify_tls: true,
            follow_redirects: true,
            http1_only: false,
            proxy: proxy_identity(&None),
        };
        let key_unverified = ClientKey {
            verify_tls: false,
            follow_redirects: true,
            http1_only: false,
            proxy: proxy_identity(&None),
        };

        assert_ne!(key_verified, key_unverified);
    }

    #[test]
    fn the_client_cache_separates_redirect_policies() {
        let follow = ClientKey {
            verify_tls: true,
            follow_redirects: true,
            http1_only: false,
            proxy: proxy_identity(&None),
        };
        let no_follow = ClientKey {
            verify_tls: true,
            follow_redirects: false,
            http1_only: false,
            proxy: proxy_identity(&None),
        };

        assert_ne!(follow, no_follow);
    }

    #[test]
    fn proxy_identity_distinguishes_different_proxies() {
        let make = |url: &str| {
            Some(ProxyConfig {
                mode: "custom".to_string(),
                custom_proxy: Some(CustomProxyConfig {
                    url: url.to_string(),
                    use_for_http: true,
                    use_for_https: true,
                    username: None,
                    password: None,
                    bypass: vec![],
                }),
                system_proxy_auth: None,
            })
        };

        assert_ne!(proxy_identity(&make("http://a:8080")), proxy_identity(&make("http://b:8080")));
        assert_eq!(proxy_identity(&make("http://a:8080")), proxy_identity(&make("http://a:8080")));
    }

    #[test]
    fn proxy_identity_treats_no_config_and_system_mode_distinctly() {
        let system = Some(ProxyConfig {
            mode: "system".to_string(),
            custom_proxy: None,
            system_proxy_auth: None,
        });

        assert_eq!(proxy_identity(&None), "default");
        assert_eq!(proxy_identity(&system), "system");
    }

    #[test]
    fn an_empty_bypass_list_means_no_exceptions() {
        assert!(build_no_proxy(&[]).is_none());
        assert!(build_no_proxy(&["".to_string(), "  ".to_string()]).is_none());
    }

    #[test]
    fn a_bypass_list_is_passed_to_reqwest() {
        assert!(build_no_proxy(&["localhost".to_string(), "127.0.0.1".to_string()]).is_some());
    }

    #[test]
    fn bypass_entries_are_trimmed_and_blanks_dropped() {
        assert!(build_no_proxy(&[" localhost ".to_string(), "".to_string()]).is_some());
    }

    #[test]
    fn the_bypass_list_is_part_of_the_client_identity() {
        let with = |bypass: Vec<String>| {
            Some(ProxyConfig {
                mode: "custom".to_string(),
                custom_proxy: Some(CustomProxyConfig {
                    url: "http://proxy.test:8080".to_string(),
                    use_for_http: true,
                    use_for_https: true,
                    username: None,
                    password: None,
                    bypass,
                }),
                system_proxy_auth: None,
            })
        };

        assert_ne!(
            proxy_identity(&with(vec!["localhost".to_string()])),
            proxy_identity(&with(vec![])),
            "two bypass lists must not share a cached client"
        );
    }

    #[test]
    fn system_proxy_auth_is_part_of_the_client_identity() {
        let with_auth = Some(ProxyConfig {
            mode: "system".to_string(),
            custom_proxy: None,
            system_proxy_auth: Some(ProxyAuth {
                username: "u".to_string(),
                password: "p".to_string(),
            }),
        });
        let without = Some(ProxyConfig {
            mode: "system".to_string(),
            custom_proxy: None,
            system_proxy_auth: None,
        });

        assert_ne!(proxy_identity(&with_auth), proxy_identity(&without));
    }

    #[tokio::test]
    async fn multipart_accepts_plain_text_fields() {
        let form = build_multipart(vec![FormPart {
            key: "name".to_string(),
            value: "value".to_string(),
            file_path: None,
            content_type: None,
        }])
        .await;

        assert!(form.is_ok());
    }

    #[tokio::test]
    async fn multipart_reads_a_real_file() {
        let path = std::env::temp_dir().join("apilator-multipart-test.txt");
        std::fs::write(&path, b"hello").expect("write fixture");

        let form = build_multipart(vec![FormPart {
            key: "upload".to_string(),
            value: String::new(),
            file_path: Some(path.to_string_lossy().to_string()),
            content_type: Some("text/plain".to_string()),
        }])
        .await;

        assert!(form.is_ok(), "{:?}", form.err());
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn a_missing_upload_file_is_reported_rather_than_silently_skipped() {
        let err = build_multipart(vec![FormPart {
            key: "upload".to_string(),
            value: String::new(),
            file_path: Some("C:/definitely/not/here.bin".to_string()),
            content_type: None,
        }])
        .await
        .expect_err("missing file must fail");

        assert_eq!(err.code.as_deref(), Some("FILE_NOT_READABLE"));
    }

    #[tokio::test]
    async fn an_invalid_content_type_is_rejected() {
        let path = std::env::temp_dir().join("apilator-multipart-mime.txt");
        std::fs::write(&path, b"x").expect("write fixture");

        let err = build_multipart(vec![FormPart {
            key: "upload".to_string(),
            value: String::new(),
            file_path: Some(path.to_string_lossy().to_string()),
            content_type: Some("not a mime type".to_string()),
        }])
        .await
        .expect_err("bad mime must fail");

        assert_eq!(err.code.as_deref(), Some("INVALID_CONTENT_TYPE"));
        let _ = std::fs::remove_file(&path);
    }

    #[tokio::test]
    async fn an_empty_file_path_is_treated_as_a_text_field() {
        let form = build_multipart(vec![FormPart {
            key: "name".to_string(),
            value: "value".to_string(),
            file_path: Some(String::new()),
            content_type: None,
        }])
        .await;

        assert!(form.is_ok());
    }

    #[test]
    fn cancelling_an_unknown_request_reports_that_nothing_was_cancelled() {
        assert_eq!(cancel_request("never-registered".to_string()), Ok(false));
    }

    #[tokio::test]
    async fn an_unsupported_method_is_rejected_before_any_network_call() {
        let mut p = params("https://example.com", true);
        p.method = "BREW".to_string();

        let err = send_request(p).await.expect_err("should reject");
        assert_eq!(err.code.as_deref(), Some("INVALID_METHOD"));
    }

    #[tokio::test]
    async fn an_invalid_proxy_url_is_rejected() {
        let mut p = params("https://example.com", true);
        p.proxy = Some(ProxyConfig {
            mode: "custom".to_string(),
            custom_proxy: Some(CustomProxyConfig {
                url: "not a url".to_string(),
                use_for_http: true,
                use_for_https: true,
                username: None,
                password: None,
                bypass: vec![],
            }),
            system_proxy_auth: None,
        });

        let err = send_request(p).await.expect_err("should reject");
        assert_eq!(err.code.as_deref(), Some("INVALID_PROXY_URL"));
    }

    #[tokio::test]
    async fn a_cancelled_request_reports_the_cancelled_error_type() {
        let mut p = params("https://httpbin.org/delay/10", true);
        p.request_id = Some("cancel-me".to_string());

        let handle = tokio::spawn(async { send_request(p).await });

        // Give send_request a moment to register its cancel channel.
        for _ in 0..50 {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            if cancel_request("cancel-me".to_string()) == Ok(true) {
                break;
            }
        }

        let err = handle.await.unwrap().expect_err("should be cancelled");
        assert_eq!(err.error_type, "cancelled");
    }

    #[tokio::test]
    #[ignore]
    async fn a_multipart_request_arrives_with_its_fields_and_file() {
        let path = std::env::temp_dir().join("apilator-e2e-upload.txt");
        std::fs::write(&path, b"file contents here").expect("write fixture");

        let mut p = params("https://httpbin.org/post", true);
        p.method = "POST".to_string();
        p.form_data = Some(vec![
            FormPart {
                key: "title".to_string(),
                value: "hello".to_string(),
                file_path: None,
                content_type: None,
            },
            FormPart {
                key: "upload".to_string(),
                value: String::new(),
                file_path: Some(path.to_string_lossy().to_string()),
                content_type: Some("text/plain".to_string()),
            },
        ]);

        let response = send_request(p).await.expect("multipart request should succeed");
        assert_eq!(response.status, 200);

        // httpbin echoes what it received, so this proves the parts actually arrived.
        assert!(
            response.body.contains("\"title\"") && response.body.contains("hello"),
            "text field missing from echo: {}",
            &response.body[..response.body.len().min(400)]
        );
        assert!(
            response.body.contains("file contents here"),
            "file part missing from echo: {}",
            &response.body[..response.body.len().min(400)]
        );

        let _ = std::fs::remove_file(&path);
    }

    // Network-dependent, so excluded from the default run and from CI.
    // Run with: cargo test -- --ignored
    #[tokio::test]
    #[ignore]
    async fn an_expired_certificate_is_rejected_when_verification_is_on() {
        let err = send_request(params("https://expired.badssl.com/", true))
            .await
            .expect_err("expired cert must not be accepted");
        assert_eq!(err.error_type, "network", "unexpected error: {:?}", err);
    }

    #[tokio::test]
    #[ignore]
    async fn an_expired_certificate_is_accepted_when_verification_is_off() {
        let response = send_request(params("https://expired.badssl.com/", false))
            .await
            .expect("verification is off, so the request should go through");

        assert_eq!(response.status, 200);
        assert!(!response.tls_verified);
    }

    #[tokio::test]
    #[ignore]
    async fn a_valid_certificate_is_accepted_when_verification_is_on() {
        let response = send_request(params("https://example.com/", true))
            .await
            .expect("a valid certificate must be accepted");

        assert_eq!(response.status, 200);
        assert!(response.tls_verified);
        assert!(!response.truncated);
        assert_eq!(response.body_encoding, "utf8");
    }

    #[tokio::test]
    #[ignore]
    async fn a_response_larger_than_the_limit_is_truncated() {
        let mut p = params("https://example.com/", true);
        p.max_response_bytes = Some(64);

        let response = send_request(p).await.expect("should succeed");

        assert!(response.truncated);
        assert_eq!(response.size, 64);
    }

    #[tokio::test]
    #[ignore]
    async fn a_zero_limit_means_no_limit() {
        let mut p = params("https://example.com/", true);
        p.max_response_bytes = Some(0);

        let response = send_request(p).await.expect("should succeed");

        assert!(!response.truncated);
        assert!(response.size > 64);
    }
}
