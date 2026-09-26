fn main() {
    tauri_build::build();

    // `tauri_build::build()` already emits its own `cargo:rerun-if-changed`
    // (tauri.conf.json, icons, capabilities/*). That turns off Cargo's
    // default "rerun if anything in the package changed" behavior once ANY
    // rerun-if-changed is emitted — without this line, the stamp below would
    // only regenerate when something in Tauri's own scope changed, not on
    // every build. Pointing at a path that never exists forces Cargo to
    // treat this script as "always modified" and run it on every build.
    println!("cargo:rerun-if-changed=NEVER_EXISTS_FORCE_RERUN_EVERY_BUILD");

    // Build timestamp, exposed via `env!("STOCKLY_BUILD_TIME")` — shown next
    // to the app version in Configurações so a specific installed build can
    // be identified even though the semver alone doesn't change between
    // builds of the same version. Stored in the same UTC "YYYY-MM-DD
    // HH:MM:SS" shape as `datetime('now')` so the frontend can format it
    // with the existing `fmtDateTime()` helper instead of a one-off parser.
    println!("cargo:rustc-env=STOCKLY_BUILD_TIME={}", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S"));
}
