//! Google Desktop OAuth for the optional online reviews feature.
//! The browser handles consent; only the one-use Google ID token crosses to JS,
//! where Firebase exchanges it for a Firebase session.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[derive(Default)]
pub struct GoogleOAuthState {
    active: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Deserialize)]
struct TokenResponse {
    id_token: Option<String>,
    error_description: Option<String>,
}

fn random_token(bytes: usize) -> String {
    let mut data = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut data);
    URL_SAFE_NO_PAD.encode(data)
}

fn reply(stream: &mut TcpStream, status: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
}

fn request_path(stream: &mut TcpStream) -> Result<String, String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;
    let mut line = Vec::with_capacity(128);
    let mut byte = [0_u8; 1];
    while line.len() < 4096 {
        if stream.read(&mut byte).map_err(|e| e.to_string())? == 0 {
            break;
        }
        if byte[0] == b'\n' {
            break;
        }
        line.push(byte[0]);
    }
    let line = std::str::from_utf8(&line).map_err(|e| e.to_string())?;
    let mut parts = line.trim_end().split_whitespace();
    if parts.next() != Some("GET") {
        return Err("Ungültige OAuth-Anfrage.".into());
    }
    parts
        .next()
        .filter(|path| path.starts_with('/') && path.len() < 4096)
        .map(str::to_owned)
        .ok_or_else(|| "Ungültiger OAuth-Rückruf.".into())
}

fn await_callback(
    listener: TcpListener,
    expected_state: String,
    cancelled: Arc<AtomicBool>,
) -> Result<String, String> {
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let deadline = Instant::now() + Duration::from_secs(300);
    loop {
        if cancelled.load(Ordering::SeqCst) {
            return Err("Anmeldung abgebrochen.".into());
        }
        if Instant::now() >= deadline {
            return Err("Anmeldung zeitlich abgelaufen. Bitte erneut versuchen.".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let path = match request_path(&mut stream) {
                    Ok(path) => path,
                    Err(_) => {
                        reply(&mut stream, "400 Bad Request", "Ungültige Anfrage.");
                        continue;
                    }
                };
                let parsed = Url::parse(&format!("http://127.0.0.1:{port}{path}"))
                    .map_err(|e| e.to_string())?;
                if parsed.host_str() != Some("127.0.0.1")
                    || parsed.port() != Some(port)
                    || parsed.path() != "/"
                {
                    reply(&mut stream, "404 Not Found", "Unbekannter Rückruf.");
                    continue;
                }
                let query: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
                if query.get("state") != Some(&expected_state) {
                    reply(&mut stream, "400 Bad Request", "Anmeldung konnte nicht bestätigt werden.");
                    continue;
                }
                if query.contains_key("error") {
                    reply(&mut stream, "200 OK", "Anmeldung abgebrochen. Sie können dieses Fenster schließen.");
                    return Err("Anmeldung abgebrochen.".into());
                }
                if let Some(code) = query.get("code").filter(|code| !code.is_empty()) {
                    reply(&mut stream, "200 OK", "Bitte zu MW Master zurückkehren. Sie können dieses Fenster schließen.");
                    return Ok(code.clone());
                }
                reply(&mut stream, "400 Bad Request", "Anmeldung fehlgeschlagen.");
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn verify_token_context(id_token: &str, client_id: &str, nonce: &str) -> Result<(), String> {
    // Firebase validates Google's signature during signInWithCredential. These
    // context checks catch a mismatched response before the token leaves Rust.
    let payload = id_token
        .split('.')
        .nth(1)
        .ok_or_else(|| "Ungültige Google-Anmeldeantwort.".to_string())?;
    let bytes = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "Ungültige Google-Anmeldeantwort.".to_string())?;
    let claims: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Ungültige Google-Anmeldeantwort.".to_string())?;
    if claims["aud"].as_str() != Some(client_id) || claims["nonce"].as_str() != Some(nonce) {
        return Err("Google-Anmeldeantwort passt nicht zur Anfrage.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn google_oauth_sign_in(
    app: AppHandle,
    state: State<'_, GoogleOAuthState>,
    client_id: String,
    client_secret: String,
) -> Result<String, String> {
    if !client_id.ends_with(".apps.googleusercontent.com")
        || client_id.len() > 256
        || !client_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
    {
        return Err("Google Desktop OAuth Client-ID fehlt oder ist ungültig.".into());
    }

    if client_secret.is_empty() || client_secret.len() > 256 || !client_secret.is_ascii() {
        return Err("Google Desktop OAuth Client-Secret fehlt oder ist ungültig.".into());
    }

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let redirect_uri = format!(
        "http://127.0.0.1:{}",
        listener.local_addr().map_err(|e| e.to_string())?.port()
    );
    let verifier = random_token(64);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let oauth_state = random_token(32);
    let nonce = random_token(32);
    let cancelled = Arc::new(AtomicBool::new(false));
    {
        let mut active = state.active.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("Eine Anmeldung läuft bereits.".into());
        }
        *active = Some(cancelled.clone());
    }

    let result = async {
        let mut auth_url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
            .map_err(|e| e.to_string())?;
        auth_url.query_pairs_mut().extend_pairs([
            ("client_id", client_id.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("code_challenge", challenge.as_str()),
            ("code_challenge_method", "S256"),
            ("state", oauth_state.as_str()),
            ("nonce", nonce.as_str()),
        ]);
        app.opener()
            .open_url(auth_url.to_string(), None::<&str>)
            .map_err(|e| format!("Browser konnte nicht geöffnet werden: {e}"))?;
        let wait_cancelled = cancelled.clone();
        let code = tauri::async_runtime::spawn_blocking(move || {
            await_callback(listener, oauth_state, wait_cancelled)
        })
        .await
        .map_err(|e| e.to_string())??;

        let form = url::form_urlencoded::Serializer::new(String::new())
            .extend_pairs([
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret.as_str()),
                ("code", code.as_str()),
                ("code_verifier", verifier.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
                ("grant_type", "authorization_code"),
            ])
            .finish();
        let response = tauri_plugin_http::reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?
            .post("https://oauth2.googleapis.com/token")
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(form)
            .send()
            .await
            .map_err(|e| format!("Google-Anmeldung konnte nicht abgeschlossen werden: {e}"))?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Ungültige Google-Anmeldeantwort: {e}"))?;
        let token: TokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Ungültige Google-Anmeldeantwort: {e}"))?;
        if !status.is_success() {
            return Err(token
                .error_description
                .unwrap_or_else(|| "Google-Anmeldung fehlgeschlagen.".into()));
        }
        let id_token = token
            .id_token
            .ok_or_else(|| "Google hat kein ID-Token geliefert.".to_string())?;
        if cancelled.load(Ordering::SeqCst) {
            return Err("Anmeldung abgebrochen.".into());
        }
        verify_token_context(&id_token, &client_id, &nonce)?;
        Ok(id_token)
    }
    .await;

    *state.active.lock().map_err(|e| e.to_string())? = None;
    result
}

#[tauri::command]
pub fn google_oauth_cancel(state: State<GoogleOAuthState>) -> Result<(), String> {
    if let Some(cancelled) = state.active.lock().map_err(|e| e.to_string())?.as_ref() {
        cancelled.store(true, Ordering::SeqCst);
    }
    Ok(())
}
