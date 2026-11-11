#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::io::Write;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
mod client_publishing;

fn validate_library_model(model: &Value) -> Result<u64, String> {
    let id = model["num"]
        .as_u64()
        .filter(|v| *v > 100_000_000_000 && *v < 9_007_199_254_740_991)
        .ok_or("Identificador de modelo no válido")?;
    let name = model["name"].as_str().unwrap_or("").trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err("El nombre debe tener entre 1 y 100 caracteres".into());
    }
    if !matches!(model["boardCode"].as_str(), Some("C1" | "C3" | "C5" | "C8")) {
        return Err("Cartón no válido".into());
    }
    let geometry = &model["geometry"];
    let faces = geometry["faces"]
        .as_array()
        .filter(|v| !v.is_empty())
        .ok_or("El modelo no contiene paneles")?;
    if faces.len() > 10000 {
        return Err("Demasiados paneles".into());
    }
    if geometry["rootFaceId"].is_null()
        || !faces
            .iter()
            .any(|face| face["id"] == geometry["rootFaceId"])
    {
        return Err("No se encuentra el panel base".into());
    }
    for key in ["width", "height"] {
        if !geometry["bounds"][key]
            .as_f64()
            .is_some_and(|v| v.is_finite() && v > 0.0)
        {
            return Err("Medidas no válidas".into());
        }
    }
    for face in faces {
        let polygon = face["polygon"]
            .as_array()
            .filter(|v| v.len() >= 3)
            .ok_or("Contorno de panel no válido")?;
        for point in polygon {
            for key in ["x", "y"] {
                if !point[key].as_f64().is_some_and(f64::is_finite) {
                    return Err("Coordenadas no válidas".into());
                }
            }
        }
    }
    if !geometry["hinges"].is_array()
        || !geometry["cutSegments"].is_array()
        || !geometry["foldSegments"].is_array()
    {
        return Err("Geometría incompleta".into());
    }
    Ok(id)
}

#[tauri::command]
async fn load_library_models(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("library");
        if !directory.exists() {
            return Ok(json!({"models": [], "warnings": []}));
        }
        let mut models = Vec::new();
        let mut warnings = Vec::new();
        for entry in std::fs::read_dir(directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let result = (|| -> Result<Value, String> {
                if entry.metadata().map_err(|e| e.to_string())?.len() > 8_000_000 {
                    return Err("Archivo demasiado grande".into());
                }
                let model: Value =
                    serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                validate_library_model(&model)?;
                Ok(model)
            })();
            match result {
                Ok(model) => models.push(model),
                Err(_) => warnings.push(entry.file_name().to_string_lossy().into_owned()),
            }
        }
        models.sort_by_key(|m| std::cmp::Reverse(m["num"].as_u64().unwrap_or(0)));
        Ok(json!({"models": models, "warnings": warnings}))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn add_library_model(app: tauri::AppHandle, model: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("library");
        store_library_model(&directory, &model)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_library_model(app: tauri::AppHandle, model: Value) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let id = validate_library_model(&model)?;
        let bytes = serde_json::to_vec(&model).map_err(|e| e.to_string())?;
        if bytes.len() > 8_000_000 { return Err("El modelo supera el límite de 8 MB".into()); }
        let directory = app.path().app_data_dir().map_err(|e| e.to_string())?.join("library");
        let destination = directory.join(format!("{}.json", id));
        if !destination.is_file() { return Err("No existe el modelo en la biblioteca".into()); }
        // Keep a recoverable copy until the replacement has been written successfully.
        let backup = directory.join(format!("{}.backup", id));
        std::fs::copy(&destination, &backup).map_err(|e| e.to_string())?;
        if let Err(e) = std::fs::write(&destination, &bytes) {
            let _ = std::fs::copy(&backup, &destination);
            return Err(e.to_string());
        }
        let _ = std::fs::remove_file(backup);
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

fn store_library_model(directory: &std::path::Path, model: &Value) -> Result<(), String> {
    let id = validate_library_model(&model)?;
    let bytes = serde_json::to_vec(&model).map_err(|e| e.to_string())?;
    if bytes.len() > 8_000_000 {
        return Err("El modelo supera el límite de 8 MB".into());
    }
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let destination = directory.join(format!("{}.json", id));
    if destination.exists() {
        return Err("Ya existe un modelo con ese identificador".into());
    }
    let temporary = directory.join(format!("{}.tmp", id));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let written = file.write_all(&bytes).and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = written {
        let _ = std::fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    std::fs::rename(&temporary, &destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_roundtrip_and_no_overwrite() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!(
                "troqueles-library-test-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        let model = json!({"num": 1800000000001_u64, "name": "Caja de prueba ñ", "boardCode": "C5", "geometry": {"bounds":{"width":120,"height":80}, "rootFaceId":1, "faces":[{"id":1,"polygon":[{"x":0,"y":0},{"x":120,"y":0},{"x":120,"y":80}]}], "hinges":[],"cutSegments":[],"foldSegments":[]}});
        store_library_model(&directory, &model).unwrap();
        let filename = directory.join("1800000000001.json");
        let loaded: Value = serde_json::from_slice(&std::fs::read(&filename).unwrap()).unwrap();
        assert_eq!(loaded, model);
        let mut changed = model.clone();
        changed["name"] = json!("Otro nombre");
        assert!(store_library_model(&directory, &changed).is_err());
        assert_eq!(
            serde_json::from_slice::<Value>(&std::fs::read(&filename).unwrap()).unwrap(),
            model
        );
        std::fs::remove_file(filename).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}

#[tauri::command]
async fn save_export(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // The user chooses the destination for each export; no unrestricted file API.
        let name = std::path::Path::new(&filename)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("troquel.svg");
        let selected = app.dialog().file().set_file_name(name).blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        std::fs::write(path, data).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_blend(app: tauri::AppHandle, data: Vec<u8>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if data.len() < 12 || data.len() > 250_000_000 || &data[..4] != b"glTF" {
            return Err("El modelo GLB no es válido o supera 250 MB".into());
        }
        let base = std::path::PathBuf::from(std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into())).join("Blender Foundation");
        let mut candidates: Vec<_> = std::fs::read_dir(base).map_err(|_| "Instala Blender en este equipo para crear archivos .blend".to_string())?
            .filter_map(Result::ok).map(|e| e.path().join("blender.exe")).filter(|p| p.is_file()).collect();
        candidates.sort();
        let blender = candidates.pop().ok_or("No se encuentra blender.exe")?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let temp = app.path().app_cache_dir().map_err(|e| e.to_string())?.join(format!("blend-{}", stamp));
        std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
        let input = temp.join("modelo.glb");
        let script = temp.join("create_blend.py");
        let destination = app.path().desktop_dir().map_err(|e| e.to_string())?.join(format!("Troquel-Animado-{}.blend", stamp));
        std::fs::write(&input, data).map_err(|e| e.to_string())?;
        std::fs::write(&script, include_str!("../../desktop/create_blend.py")).map_err(|e| e.to_string())?;
        let mut command = std::process::Command::new(blender);
        command.args(["--background", "--factory-startup", "--python-exit-code", "1", "--python"])
            .arg(&script).arg("--").arg(&input).arg(&destination);
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let output = command.output().map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&temp);
        if !output.status.success() || !destination.is_file() {
            return Err(format!("Blender no pudo crear la escena: {}", String::from_utf8_lossy(&output.stderr)));
        }
        Ok(destination.to_string_lossy().into_owned())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_project(app: tauri::AppHandle, project: Value) -> Result<(), String> {
    let id=project["id"].as_str().filter(|s| !s.is_empty() && s.len() < 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c=='-')).ok_or("Identificador de proyecto no válido")?.to_string();
    let bytes=serde_json::to_vec(&project).map_err(|e|e.to_string())?;
    if bytes.len()>40_000_000 { return Err("El proyecto supera 40 MB".into()); }
    let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("projects");
    std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let target=dir.join(format!("{}.json",id));
    if target.exists() { return Err("El proyecto ya existe".into()); }
    std::fs::write(target,bytes).map_err(|e|e.to_string())
}

#[tauri::command]
async fn load_projects(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    let dir=app.path().app_data_dir().map_err(|e|e.to_string())?.join("projects");
    if !dir.exists() {return Ok(vec![]);}
    let mut projects=Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e|e.to_string())? {
        let path=entry.map_err(|e|e.to_string())?.path();
        if path.extension().and_then(|x|x.to_str())!=Some("json") {continue;}
        let bytes=std::fs::read(path).map_err(|e|e.to_string())?;
        if bytes.len()>40_000_000{return Err("Un proyecto supera 40 MB".into());}
        projects.push(serde_json::from_slice(&bytes).map_err(|e|e.to_string())?);
    }
    Ok(projects)
}

#[tauri::command]
fn open_browser_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("URL no válida".into());
    }
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("rundll32");
        cmd.args(["url.dll,FileProtocolHandler", &url]);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            client_publishing::publish_client_model,
            open_browser_url,
            save_export,
            create_blend,
            save_project,
            load_projects,
            load_library_models,
            add_library_model,
            update_library_model
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Troqueles Vicente");
}
