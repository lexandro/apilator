use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const STATE_FILE_NAME: &str = "apilator-state.yaml";
const COLLECTIONS_FILE_NAME: &str = "apilator-collections.yaml";
const ENVIRONMENTS_FILE_NAME: &str = "apilator-environments.yaml";
const MAX_SUFFIX_LEN: usize = 32;

/// Callers name a kind rather than a path, so no filename ever crosses the IPC boundary.
fn file_name_for(kind: &str) -> Result<&'static str, String> {
    match kind {
        "state" => Ok(STATE_FILE_NAME),
        "collections" => Ok(COLLECTIONS_FILE_NAME),
        "environments" => Ok(ENVIRONMENTS_FILE_NAME),
        other => Err(format!("Unknown data file: {}", other)),
    }
}

fn resolve_file(kind: &str) -> Result<PathBuf, String> {
    Ok(get_data_dir()?.join(file_name_for(kind)?))
}

fn get_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .ok_or_else(|| "Could not find local data directory".to_string())?;
    let app_dir = base.join("Apilator");

    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;
    }

    Ok(app_dir)
}

/// Backup suffixes arrive over IPC, so they must never be able to escape the data
/// directory or collide with the live state file.
fn sanitize_suffix(suffix: &str) -> String {
    let cleaned: String = suffix
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(MAX_SUFFIX_LEN)
        .collect();

    if cleaned.is_empty() {
        "backup".to_string()
    } else {
        cleaned
    }
}

fn read_state_file(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }

    fs::read_to_string(path)
        .map(Some)
        .map_err(|e| format!("Failed to read state file: {}", e))
}

/// Writes via a temp file in the same directory, then renames over the target. A crash
/// mid-write leaves the previous state intact instead of truncating it.
fn write_state_file(path: &Path, content: &str) -> Result<(), String> {
    let dir = path
        .parent()
        .ok_or_else(|| "State file path has no parent directory".to_string())?;

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "State file path has no file name".to_string())?;

    let tmp_path = dir.join(format!("{}.tmp", file_name));

    let write_result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&tmp_path)
            .map_err(|e| format!("Failed to create temp state file: {}", e))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write temp state file: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("Failed to flush temp state file: {}", e))?;
        Ok(())
    })();

    if let Err(e) = write_result {
        let _ = fs::remove_file(&tmp_path);
        return Err(e);
    }

    if let Err(e) = fs::rename(&tmp_path, path) {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!("Failed to replace state file: {}", e));
    }

    Ok(())
}

/// Renames the state file out of the way instead of letting the caller discard it.
/// Returns the backup path, or None when there was nothing to back up.
fn backup_state_file(path: &Path, suffix: &str) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }

    let dir = path
        .parent()
        .ok_or_else(|| "State file path has no parent directory".to_string())?;

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "State file path has no file name".to_string())?;

    let backup_path = dir.join(format!("{}.{}.bak", file_name, sanitize_suffix(suffix)));

    fs::rename(path, &backup_path)
        .map_err(|e| format!("Failed to back up state file: {}", e))?;

    Ok(Some(backup_path))
}

#[tauri::command]
pub fn load_data(kind: String) -> Result<Option<String>, String> {
    read_state_file(&resolve_file(&kind)?)
}

/// Async so Tauri runs it off the main thread; a synchronous command would block the UI
/// for the whole write.
#[tauri::command]
pub async fn save_data(kind: String, yaml_content: String) -> Result<(), String> {
    let path = resolve_file(&kind)?;

    tokio::task::spawn_blocking(move || write_state_file(&path, &yaml_content))
        .await
        .map_err(|e| format!("Data write task failed: {}", e))?
}

#[tauri::command]
pub fn backup_data(kind: String, suffix: String) -> Result<Option<String>, String> {
    let backup = backup_state_file(&resolve_file(&kind)?, &suffix)?;
    Ok(backup.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn get_data_path() -> Result<String, String> {
    let path = get_data_dir()?;
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let id = COUNTER.fetch_add(1, Ordering::SeqCst);
            let path = std::env::temp_dir().join(format!(
                "apilator-test-{}-{}",
                std::process::id(),
                id
            ));
            fs::create_dir_all(&path).expect("temp dir");
            TempDir(path)
        }

        fn state_file(&self) -> PathBuf {
            self.0.join(STATE_FILE_NAME)
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn state_file_lives_in_the_app_data_dir() {
        let dir = get_data_dir().expect("data dir must resolve");
        let file = resolve_file("state").expect("state file path must resolve");

        assert_eq!(file.parent(), Some(dir.as_path()));
        assert!(dir.ends_with("Apilator"), "unexpected data dir: {:?}", dir);
    }

    #[test]
    fn every_known_kind_resolves_to_its_own_file() {
        let names: Vec<_> = ["state", "collections", "environments"]
            .iter()
            .map(|kind| file_name_for(kind).unwrap())
            .collect();

        assert_eq!(names.len(), 3);
        assert_eq!(
            names.iter().collect::<std::collections::HashSet<_>>().len(),
            3,
            "kinds must not share a file"
        );
    }

    #[test]
    fn an_unknown_kind_is_rejected() {
        assert!(file_name_for("passwords").is_err());
        assert!(file_name_for("../../etc/passwd").is_err());
        assert!(resolve_file("anything-else").is_err());
    }

    #[test]
    fn every_resolved_file_lives_in_the_data_dir() {
        let dir = get_data_dir().unwrap();
        for kind in ["state", "collections", "environments"] {
            assert_eq!(resolve_file(kind).unwrap().parent(), Some(dir.as_path()));
        }
    }

    #[test]
    fn a_backup_is_named_after_the_file_it_came_from() {
        let dir = TempDir::new();
        let path = dir.0.join(COLLECTIONS_FILE_NAME);
        write_state_file(&path, "collections").expect("seed");

        let backup = backup_state_file(&path, "corrupt").unwrap().unwrap();

        assert_eq!(
            backup.file_name().and_then(|n| n.to_str()),
            Some("apilator-collections.yaml.corrupt.bak")
        );
    }

    #[test]
    fn state_file_is_named_consistently() {
        let file = resolve_file("state").expect("state file path must resolve");

        assert_eq!(
            file.file_name().and_then(|n| n.to_str()),
            Some(STATE_FILE_NAME)
        );
    }

    #[test]
    fn get_data_dir_creates_the_directory() {
        let dir = get_data_dir().expect("data dir must resolve");
        assert!(dir.is_dir(), "data dir was not created: {:?}", dir);
    }

    #[test]
    fn reading_a_missing_file_is_not_an_error() {
        let dir = TempDir::new();
        assert_eq!(read_state_file(&dir.state_file()), Ok(None));
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = TempDir::new();
        let path = dir.state_file();

        write_state_file(&path, "version: 1\n").expect("write");

        assert_eq!(read_state_file(&path), Ok(Some("version: 1\n".to_string())));
    }

    #[test]
    fn write_overwrites_an_existing_file() {
        let dir = TempDir::new();
        let path = dir.state_file();

        write_state_file(&path, "first").expect("first write");
        write_state_file(&path, "second").expect("second write");

        assert_eq!(read_state_file(&path), Ok(Some("second".to_string())));
    }

    #[test]
    fn write_leaves_no_temp_file_behind() {
        let dir = TempDir::new();
        let path = dir.state_file();

        write_state_file(&path, "payload").expect("write");

        let leftovers: Vec<_> = fs::read_dir(&dir.0)
            .expect("read temp dir")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| n.ends_with(".tmp"))
            .collect();

        assert!(leftovers.is_empty(), "temp files left behind: {:?}", leftovers);
    }

    #[test]
    fn a_failed_write_leaves_the_previous_state_intact() {
        let dir = TempDir::new();
        let path = dir.state_file();
        write_state_file(&path, "good state").expect("seed write");

        // A directory where the temp file should go makes File::create fail, standing in
        // for any mid-write failure.
        let blocker = dir.0.join(format!("{}.tmp", STATE_FILE_NAME));
        fs::create_dir(&blocker).expect("create blocking dir");

        let result = write_state_file(&path, "replacement that must not land");

        assert!(result.is_err(), "write should have failed");
        assert_eq!(read_state_file(&path), Ok(Some("good state".to_string())));
    }

    #[test]
    fn backing_up_a_missing_file_is_not_an_error() {
        let dir = TempDir::new();
        assert_eq!(backup_state_file(&dir.state_file(), "v1"), Ok(None));
    }

    #[test]
    fn backup_moves_the_file_aside_rather_than_deleting_it() {
        let dir = TempDir::new();
        let path = dir.state_file();
        write_state_file(&path, "precious").expect("seed write");

        let backup = backup_state_file(&path, "v1")
            .expect("backup")
            .expect("backup path");

        assert!(!path.exists(), "original should have been moved");
        assert_eq!(fs::read_to_string(&backup).ok(), Some("precious".to_string()));
        assert_eq!(
            backup.file_name().and_then(|n| n.to_str()),
            Some("apilator-state.yaml.v1.bak")
        );
    }

    #[test]
    fn sanitize_suffix_strips_path_separators_and_traversal() {
        assert_eq!(sanitize_suffix("../../etc/passwd"), "etcpasswd");
        assert_eq!(sanitize_suffix("a/b\\c"), "abc");
        assert_eq!(sanitize_suffix("v1"), "v1");
        assert_eq!(sanitize_suffix("with-dash_and_underscore"), "with-dash_and_underscore");
    }

    #[test]
    fn sanitize_suffix_falls_back_when_nothing_usable_is_left() {
        assert_eq!(sanitize_suffix(""), "backup");
        assert_eq!(sanitize_suffix("///"), "backup");
    }

    #[test]
    fn sanitize_suffix_is_length_capped() {
        assert_eq!(sanitize_suffix(&"a".repeat(100)).len(), MAX_SUFFIX_LEN);
    }

    #[test]
    fn a_hostile_suffix_cannot_escape_the_data_directory() {
        let dir = TempDir::new();
        let path = dir.state_file();
        write_state_file(&path, "precious").expect("seed write");

        let backup = backup_state_file(&path, "../../escaped")
            .expect("backup")
            .expect("backup path");

        assert_eq!(backup.parent(), Some(dir.0.as_path()));
    }
}
