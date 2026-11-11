use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

const REPO: &str = "repos/davidingles/cajas_threejs-01";
const LOGIN: &str = "Inicia sesión en GitHub desde PowerShell: gh auth login --hostname github.com --web --git-protocol https";
static PUBLISHING: AtomicBool = AtomicBool::new(false);
struct PublishGuard;
impl Drop for PublishGuard { fn drop(&mut self) { PUBLISHING.store(false, Ordering::SeqCst); } }

fn filename(value: &str) -> Result<String, String> {
    let value = value.trim();
    let name = if value.to_ascii_lowercase().ends_with(".glb") { &value[..value.len()-4] } else { value };
    if name.is_empty() || name.len() > 80 || !name.as_bytes()[0].is_ascii_alphanumeric()
        || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') {
        return Err("Usa entre 1 y 80 letras sin acentos, números, guiones o guiones bajos.".into());
    }
    Ok(format!("{name}.glb"))
}

fn find_local_repo(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    if let Ok(desktop) = app.path().desktop_dir() {
        let repo = desktop.join("CAJAS_THREEJS-01");
        if repo.join(".git").exists() {
            return Some(repo);
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let repo = std::path::PathBuf::from(profile).join("Desktop").join("CAJAS_THREEJS-01");
        if repo.join(".git").exists() {
            return Some(repo);
        }
    }
    None
}

fn publish_via_local_git(repo: &Path, name: &str, data: &[u8]) -> Result<Value, String> {
    let models_dir = repo.join("modelos");
    let _ = std::fs::create_dir_all(&models_dir);
    let target = models_dir.join(name);
    if target.exists() {
        return Err("Ya existe una caja con esa clave. Elige otro nombre para no sustituirla.".into());
    }
    std::fs::write(&target, data).map_err(|e| format!("Error guardando archivo local: {e}"))?;

    let run_git = |args: &[&str]| -> Result<String, String> {
        let mut cmd = Command::new("git");
        cmd.current_dir(repo).args(args);
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        let out = cmd.output().map_err(|e| format!("Error ejecutando git: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            let msg = if err.trim().is_empty() { String::from_utf8_lossy(&out.stdout) } else { err };
            return Err(msg.trim().to_string());
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    };

    let result = (|| -> Result<Value, String> {
        run_git(&["add", &format!("modelos/{name}")])?;
        run_git(&["commit", "-m", &format!("Publicar caja {name}")])?;
        run_git(&["push", "origin", "main"])?;
        let commit = run_git(&["rev-parse", "HEAD"]).unwrap_or_default();
        let key = name.trim_end_matches(".glb");
        let url = format!("https://davidingles.github.io/cajas_threejs-01/?caja={key}");
        Ok(json!({
            "filename": name,
            "key": key,
            "url": url,
            "commit": commit
        }))
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&target);
    }
    result
}

fn parse_response(output: &[u8]) -> Result<(u16, Value), String> {
    let text = String::from_utf8_lossy(output).replace("\r\n", "\n");
    let (headers, body) = text.split_once("\n\n").ok_or(LOGIN)?;
    let status = headers.lines().next().and_then(|line| line.split_whitespace().nth(1))
        .and_then(|s| s.parse().ok()).ok_or(LOGIN)?;
    let body = serde_json::from_str(body).map_err(|_| "GitHub devolvió una respuesta no válida. Comprueba la conexión.")?;
    Ok((status, body))
}

fn api(method: &str, endpoint: &str, input: Option<&Path>) -> Result<(u16, Value), String> {
    let gh = std::path::PathBuf::from(std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into()))
        .join("GitHub CLI").join("gh.exe");
    let mut command = Command::new(gh);
    command.args(["api", "--hostname", "github.com", "--include", "--jq", "{default_branch,sha,type,commit:{sha:.commit.sha}}", "--method", method, endpoint]);
    if let Some(input) = input { command.arg("--input").arg(input); }
    command.env("GH_PROMPT_DISABLED", "1").env("GH_HOST", "github.com");
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().map_err(|_| LOGIN.to_string())?;
    parse_response(&output.stdout)
}

#[tauri::command]
pub async fn publish_client_model(app: tauri::AppHandle, filename: String, data: Vec<u8>) -> Result<Value, String> {
    let name = self::filename(&filename)?;
    if data.len() < 12 || data.len() > 20_000_000 || &data[..4] != b"glTF"
        || u32::from_le_bytes(data[4..8].try_into().unwrap()) != 2
        || u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize != data.len() {
        return Err("El archivo debe ser un GLB válido y no superar 20 MB.".into());
    }
    if PUBLISHING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_err() {
        return Err("Ya hay una publicación en curso.".into());
    }
    let guard = PublishGuard;
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        if let Some(local_repo) = find_local_repo(&app_handle) {
            match publish_via_local_git(&local_repo, &name, &data) {
                Ok(val) => return Ok(val),
                Err(e) if e.contains("Ya existe una caja con esa clave") => return Err(e),
                Err(_) => {
                    // Si falla el repo local, intentamos vía gh api
                }
            }
        }

        let (status, repo) = api("GET", REPO, None)?;
        if status != 200 { return Err("No se puede acceder al repositorio. Comprueba tu cuenta y sus permisos.".into()); }
        let branch = repo["default_branch"].as_str().ok_or("No se encuentra la rama principal")?;
        let endpoint = format!("{REPO}/contents/modelos/{name}");
        let (status, _) = api("GET", &endpoint, None)?;
        if status == 200 { return Err("Ya existe una caja con esa clave. Elige otro nombre para no sustituirla.".into()); }
        if status != 404 { return Err("No se pudo comprobar la clave en GitHub. Inténtalo de nuevo.".into()); }
        let directory = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?.join("publishing");
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let input = directory.join(format!("upload-{stamp}.json"));
        let payload = json!({"message": format!("Publicar caja {name}"), "branch": branch, "content": STANDARD.encode(&data)});
        std::fs::write(&input, serde_json::to_vec(&payload).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let response = api("PUT", &endpoint, Some(&input));
        let _ = std::fs::remove_file(input);
        let (status, body) = response?;
        if status != 201 {
            return Err(if status == 409 || status == 422 { "La clave ya existe o cambió el repositorio. Prueba con otro nombre." }
                else { "GitHub no aceptó la subida. Comprueba la conexión y los permisos de escritura." }.into());
        }
        let key = name.trim_end_matches(".glb");
        let url = format!("https://davidingles.github.io/cajas_threejs-01/?caja={key}");
        Ok(json!({"filename":name,"key":key,"url":url,"commit":body["commit"]["sha"]}))
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn keys_are_single_portable_filenames() {
        assert_eq!(filename(" Cliente_01.GLB ").unwrap(), "Cliente_01.glb");
        for value in ["", "../otra", "caja/otra", "a.glb.glb", "caja con espacios", "caja?x", "cajá"] { assert!(filename(value).is_err()); }
    }
    #[test]
    fn github_responses_preserve_http_status() {
        let (status, body) = parse_response(b"HTTP/2.0 404 Not Found\r\nContent-Type: application/json\r\n\r\n{\"sha\":null}\n").unwrap();
        assert_eq!(status, 404); assert!(body["sha"].is_null());
        assert!(parse_response(b"not logged in").is_err());
    }
}
