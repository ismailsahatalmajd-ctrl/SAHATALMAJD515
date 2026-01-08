#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // شغّل خادم Next محليًا على المنفذ 3004 في الخلفية عند بدء التطبيق
  // يعتمد ذلك على توفر Node/NPM في جهاز التشغيل.
  if let Some(project_root) = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent() {
    let _ = std::thread::Builder::new()
      .name("next-server".into())
      .spawn({
        let root = project_root.to_path_buf();
        move || {
          let _ = std::process::Command::new("cmd")
            .args(["/C", "npm run start -- -p 3004"])
            .current_dir(&root)
            .spawn();
        }
      });
  }

  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}