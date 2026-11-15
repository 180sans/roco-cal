#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    if rocodatebase_lib::run_visibility_input_helper() { return; }
    #[cfg(windows)]
    match roco_desktop_native::window_access::request_window_binding_elevation() {
        Ok(true) => return,
        Ok(false) => {},
        Err(error) => eprintln!("{error}"),
    }
    rocodatebase_lib::run()
}
