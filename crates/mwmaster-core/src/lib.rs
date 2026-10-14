//! Core of the MW Master app: private SQLite storage, backups and reading the
//! shared data folder. No Tauri dependency, so it builds and tests anywhere.
//!
//! All grade maths, validation of the shared data and statistics live in the
//! TypeScript frontend (`src/logic`). This crate only stores and moves data.

pub mod backup;
pub mod db;
pub mod export;
pub mod shared;

pub use db::{Belegung, Db, DbError, EigenerTermin, Snapshot, SCHEMA_VERSION};
