use rusqlite::Row;
use serde::Serialize;

/// `username` is intentionally excluded — it's an internal login key only
/// (auto-derived from `name`, see `commands::users::slugify`), never shown
/// or edited through the UI (login picks a profile by id, not by typing it).
pub const USER_PROFILE_COLUMNS: &str = "id, name, is_admin, active, auto_lock_minutes, theme, last_login_at";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserSummary {
    pub id: i64,
    pub name: String,
    pub is_admin: bool,
    pub active: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub id: i64,
    pub name: String,
    pub is_admin: bool,
    pub active: bool,
    pub auto_lock_minutes: Option<i64>,
    pub theme: String,
    pub last_login_at: Option<String>,
}

impl UserProfile {
    /// Row shape must match `USER_PROFILE_COLUMNS`'s column order.
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get(0)?,
            name: row.get(1)?,
            is_admin: row.get::<_, i64>(2)? != 0,
            active: row.get::<_, i64>(3)? != 0,
            auto_lock_minutes: row.get(4)?,
            theme: row.get(5)?,
            last_login_at: row.get(6)?,
        })
    }
}
