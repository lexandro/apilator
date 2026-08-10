pub mod http_client;
pub mod jwt;
pub mod persistence;
pub mod secrets;
pub mod system_proxy;
pub mod system_info;

use http_client::{cancel_request, send_request};
use jwt::sign_jwt;
use persistence::{backup_data, get_data_path, load_data, save_data};
use secrets::{delete_secret, get_secret, set_secret};
use system_info::{get_arch, get_system_info};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            send_request,
            cancel_request,
            sign_jwt,
            load_data,
            save_data,
            backup_data,
            get_data_path,
            get_secret,
            set_secret,
            delete_secret,
            get_system_info,
            get_arch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
