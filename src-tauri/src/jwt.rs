use base64::Engine;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::{Sha256, Sha384, Sha512};

#[derive(Debug, Deserialize)]
pub struct SignJwtParams {
    pub algorithm: String,
    pub secret: String,
    pub secret_base64_encoded: bool,
    /// Raw JSON from the UI, used verbatim as the claims set.
    pub payload: String,
    /// Raw JSON from the UI, merged under the mandatory alg and typ fields.
    pub jwt_headers: String,
}

fn base64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn decode_secret(secret: &str, base64_encoded: bool) -> Result<Vec<u8>, String> {
    if !base64_encoded {
        return Ok(secret.as_bytes().to_vec());
    }

    base64::engine::general_purpose::STANDARD
        .decode(secret)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(secret))
        .map_err(|e| format!("Secret is marked as base64 but could not be decoded: {}", e))
}

/// Serialises the JSON with alg and typ forced to the correct values, so a user-supplied
/// header object cannot claim an algorithm we are not actually signing with.
fn build_header(algorithm: &str, jwt_headers: &str) -> Result<String, String> {
    let trimmed = jwt_headers.trim();

    let mut header: serde_json::Map<String, serde_json::Value> = if trimmed.is_empty() {
        serde_json::Map::new()
    } else {
        serde_json::from_str(trimmed).map_err(|e| format!("JWT headers are not valid JSON: {}", e))?
    };

    header.insert("alg".to_string(), serde_json::Value::String(algorithm.to_string()));
    header
        .entry("typ".to_string())
        .or_insert_with(|| serde_json::Value::String("JWT".to_string()));

    serde_json::to_string(&header).map_err(|e| format!("Failed to encode JWT header: {}", e))
}

fn compact_payload(payload: &str) -> Result<String, String> {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return Ok("{}".to_string());
    }

    let value: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("JWT payload is not valid JSON: {}", e))?;

    serde_json::to_string(&value).map_err(|e| format!("Failed to encode JWT payload: {}", e))
}

macro_rules! hmac_sign {
    ($hash:ty, $key:expr, $input:expr) => {{
        let mut mac = <Hmac<$hash>>::new_from_slice($key).expect("HMAC accepts any key length");
        mac.update($input.as_bytes());
        mac.finalize().into_bytes().to_vec()
    }};
}

fn sign(algorithm: &str, key: &[u8], signing_input: &str) -> Result<Vec<u8>, String> {
    match algorithm {
        "HS256" => Ok(hmac_sign!(Sha256, key, signing_input)),
        "HS384" => Ok(hmac_sign!(Sha384, key, signing_input)),
        "HS512" => Ok(hmac_sign!(Sha512, key, signing_input)),
        other => Err(format!(
            "Unsupported JWT algorithm: {}. Only HMAC algorithms are supported.",
            other
        )),
    }
}

pub fn sign_jwt_inner(params: &SignJwtParams) -> Result<String, String> {
    if params.secret.is_empty() {
        return Err("JWT secret is empty".to_string());
    }

    let key = decode_secret(&params.secret, params.secret_base64_encoded)?;
    let header = build_header(&params.algorithm, &params.jwt_headers)?;
    let payload = compact_payload(&params.payload)?;

    let signing_input = format!(
        "{}.{}",
        base64url(header.as_bytes()),
        base64url(payload.as_bytes())
    );

    let signature = sign(&params.algorithm, &key, &signing_input)?;

    Ok(format!("{}.{}", signing_input, base64url(&signature)))
}

#[tauri::command]
pub fn sign_jwt(params: SignJwtParams) -> Result<String, String> {
    sign_jwt_inner(&params)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn params(algorithm: &str, secret: &str, payload: &str) -> SignJwtParams {
        SignJwtParams {
            algorithm: algorithm.to_string(),
            secret: secret.to_string(),
            secret_base64_encoded: false,
            payload: payload.to_string(),
            jwt_headers: "{}".to_string(),
        }
    }

    fn parts(token: &str) -> Vec<String> {
        token.split('.').map(|s| s.to_string()).collect()
    }

    fn decode_part(part: &str) -> serde_json::Value {
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(part)
            .expect("valid base64url");
        serde_json::from_slice(&bytes).expect("valid JSON")
    }

    /// Cross-implementation vectors: these tokens were produced independently by Node's
    /// crypto.createHmac over the same header and payload encoding. Matching them proves
    /// the signature is actually correct HMAC, not merely self-consistent.
    #[test]
    fn tokens_match_an_independent_implementation() {
        let expected = [
            ("HS256", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImFkbWluIjp0cnVlfQ.gj606cSlGqDxmESunjzltv_hytVmhxgaXPM5xG5OtXQ"),
            ("HS384", "eyJhbGciOiJIUzM4NCIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImFkbWluIjp0cnVlfQ.qaco2CMq-nuifixSabNA2sE42uYiH2zJTVHyB2HjaUy2zuYFssx517XhqoZ-CP36"),
            ("HS512", "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciIsImFkbWluIjp0cnVlfQ.Mj2Orcjyb27MIyCxxIlMLujckDkkG9YRRpbYMsJaVC4UXn_MXRna5TB6gZlmh_g8uLGpACYdQD8FOxLUWuLX9Q"),
        ];

        for (algorithm, token) in expected {
            let actual = sign_jwt_inner(&SignJwtParams {
                algorithm: algorithm.to_string(),
                secret: "my-secret-key".to_string(),
                secret_base64_encoded: false,
                payload: r#"{"sub":"1234567890","name":"Test User","admin":true}"#.to_string(),
                jwt_headers: "{}".to_string(),
            })
            .expect("should sign");

            assert_eq!(actual, token, "{} token differs from the reference", algorithm);
        }
    }

    #[test]
    fn a_token_has_three_parts() {
        let token = sign_jwt_inner(&params("HS256", "secret", r#"{"sub":"1"}"#)).unwrap();
        assert_eq!(parts(&token).len(), 3);
    }

    #[test]
    fn the_header_declares_the_algorithm_and_type() {
        let token = sign_jwt_inner(&params("HS384", "secret", "{}")).unwrap();
        let header = decode_part(&parts(&token)[0]);

        assert_eq!(header["alg"], "HS384");
        assert_eq!(header["typ"], "JWT");
    }

    #[test]
    fn the_payload_round_trips() {
        let token = sign_jwt_inner(&params("HS256", "secret", r#"{"sub":"42","admin":true}"#)).unwrap();
        let payload = decode_part(&parts(&token)[1]);

        assert_eq!(payload["sub"], "42");
        assert_eq!(payload["admin"], true);
    }

    #[test]
    fn signature_length_matches_the_hash() {
        for (algorithm, bytes) in [("HS256", 32), ("HS384", 48), ("HS512", 64)] {
            let token = sign_jwt_inner(&params(algorithm, "secret", "{}")).unwrap();
            let signature = base64::engine::general_purpose::URL_SAFE_NO_PAD
                .decode(&parts(&token)[2])
                .unwrap();
            assert_eq!(signature.len(), bytes, "{} signature length", algorithm);
        }
    }

    #[test]
    fn a_different_secret_produces_a_different_signature() {
        let a = sign_jwt_inner(&params("HS256", "secret-a", "{}")).unwrap();
        let b = sign_jwt_inner(&params("HS256", "secret-b", "{}")).unwrap();

        assert_ne!(parts(&a)[2], parts(&b)[2]);
    }

    #[test]
    fn a_different_payload_produces_a_different_signature() {
        let a = sign_jwt_inner(&params("HS256", "secret", r#"{"a":1}"#)).unwrap();
        let b = sign_jwt_inner(&params("HS256", "secret", r#"{"a":2}"#)).unwrap();

        assert_ne!(parts(&a)[2], parts(&b)[2]);
    }

    #[test]
    fn the_token_contains_no_base64_padding() {
        let token = sign_jwt_inner(&params("HS256", "secret", r#"{"sub":"padding-check"}"#)).unwrap();
        assert!(!token.contains('='), "JWT uses base64url without padding");
    }

    #[test]
    fn an_empty_payload_becomes_an_empty_object() {
        let token = sign_jwt_inner(&params("HS256", "secret", "")).unwrap();
        assert_eq!(decode_part(&parts(&token)[1]), serde_json::json!({}));
    }

    #[test]
    fn custom_headers_are_kept() {
        let mut p = params("HS256", "secret", "{}");
        p.jwt_headers = r#"{"kid":"key-1"}"#.to_string();

        let header = decode_part(&parts(&sign_jwt_inner(&p).unwrap())[0]);
        assert_eq!(header["kid"], "key-1");
    }

    #[test]
    fn a_header_cannot_lie_about_the_algorithm() {
        let mut p = params("HS256", "secret", "{}");
        p.jwt_headers = r#"{"alg":"none"}"#.to_string();

        let header = decode_part(&parts(&sign_jwt_inner(&p).unwrap())[0]);
        assert_eq!(header["alg"], "HS256", "alg must reflect what we actually signed with");
    }

    #[test]
    fn a_base64_secret_is_decoded_before_use() {
        let raw = sign_jwt_inner(&SignJwtParams {
            algorithm: "HS256".to_string(),
            secret: "abc".to_string(),
            secret_base64_encoded: false,
            payload: "{}".to_string(),
            jwt_headers: "{}".to_string(),
        })
        .unwrap();

        let encoded = sign_jwt_inner(&SignJwtParams {
            algorithm: "HS256".to_string(),
            secret: base64::engine::general_purpose::STANDARD.encode("abc"),
            secret_base64_encoded: true,
            payload: "{}".to_string(),
            jwt_headers: "{}".to_string(),
        })
        .unwrap();

        assert_eq!(raw, encoded, "the same key material must give the same token");
    }

    #[test]
    fn an_empty_secret_is_rejected() {
        assert!(sign_jwt_inner(&params("HS256", "", "{}")).is_err());
    }

    #[test]
    fn an_asymmetric_algorithm_is_rejected_rather_than_silently_signed_with_hmac() {
        for algorithm in ["RS256", "ES256", "PS512", "none"] {
            let err = sign_jwt_inner(&params(algorithm, "secret", "{}")).unwrap_err();
            assert!(err.contains("Unsupported"), "{} gave: {}", algorithm, err);
        }
    }

    #[test]
    fn invalid_payload_json_is_reported() {
        let err = sign_jwt_inner(&params("HS256", "secret", "{not json")).unwrap_err();
        assert!(err.contains("payload"), "unexpected error: {}", err);
    }

    #[test]
    fn invalid_header_json_is_reported() {
        let mut p = params("HS256", "secret", "{}");
        p.jwt_headers = "{nope".to_string();

        let err = sign_jwt_inner(&p).unwrap_err();
        assert!(err.contains("headers"), "unexpected error: {}", err);
    }

    #[test]
    fn an_undecodable_base64_secret_is_reported() {
        let mut p = params("HS256", "!!!not base64!!!", "{}");
        p.secret_base64_encoded = true;

        assert!(sign_jwt_inner(&p).is_err());
    }
}
