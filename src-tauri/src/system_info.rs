use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    SystemInfo {
        os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
        os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
    }
}

#[tauri::command]
pub fn get_arch() -> String {
    std::env::consts::ARCH.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arch_is_reported() {
        assert!(!get_arch().is_empty());
    }

    #[test]
    fn system_info_never_returns_empty_strings() {
        let info = get_system_info();
        assert!(!info.os_name.is_empty());
        assert!(!info.os_version.is_empty());
    }
}
