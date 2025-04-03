// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::fs::File;

use simplelog::{CombinedLogger, Config, TermLogger, TerminalMode, WriteLogger};
fn setup_logger() -> Result<(), Box<dyn std::error::Error>> {
    // Create logs directory if it doesn't exist
    let dot_paimon_path = home::home_dir().unwrap().join(".paimon");
    let logs_path = dot_paimon_path.join("logs");
    println!("Logs directory: {}", logs_path.display());
    std::fs::create_dir_all(&logs_path)?;

    // Generate timestamp for log file name
    let local_time = chrono::Local::now();
    let timestamp = local_time.format("%Y-%m-%d_%H-%M-%S");
    let log_file_path = logs_path.join(format!("paimon_{}.log", timestamp));

    CombinedLogger::init(vec![
        // Terminal logger
        TermLogger::new(
            log::LevelFilter::Debug,
            Config::default(),
            TerminalMode::Mixed,
            simplelog::ColorChoice::Auto,
        ),
        // File logger
        WriteLogger::new(
            log::LevelFilter::Debug,
            Config::default(),
            File::create(&log_file_path)?,
        ),
    ])?;

    Ok(())
}

fn main() {
    setup_logger().unwrap();
    std::panic::set_hook(Box::new(|panic_info| {
        log::error!("Application panic: {}", panic_info);
        if let Some(location) = panic_info.location() {
            log::error!(
                "Panic occurred in file '{}' at line {}",
                location.file(),
                location.line()
            );
        }
    }));
    paimon_lib::run()
}
