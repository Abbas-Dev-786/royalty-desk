# Studio v2 database and media recovery

SQLite schema version 5 adds `studio_*` tables without changing legacy release/settlement tables. The migration runs on `openDatabase`, records version 5 in `schema_migrations`, and rolls back on failure. A newer database version is rejected.

For local backup, stop web and worker, run `PRAGMA wal_checkpoint(TRUNCATE)` on the source database, close it, then copy the SQLite file and `StudioMediaStore` root together to a separate durable backup directory. Restore both to a stopped instance. Verify schema version, studio/legacy row counts and representative media hashes before resuming. Keep backup files and agent keys outside the repository.

The first hackathon deployment uses one persistent host/volume for web, worker, SQLite and media, with a separate durable directory or volume for checkpointed backups. Configure volume paths and retention in deployment. Local tests cover closed-file copy/restore, legacy row preservation, media copy/restore and corruption rejection. A live deployment backup drill is a Phase 10 check.

Code rollback after schema 5 requires a compatible binary or restoration of a pre-migration backup. Do not delete new tables in place. Local restore cannot reverse on-chain financial history; reconcile chain events before resuming payments.
