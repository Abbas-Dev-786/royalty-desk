# Studio database and media recovery

SQLite schema version 15 creates only the studio and shared infrastructure tables. `openDatabase` upgrades a version 14 database in a transaction: it checks every retired table, rejects the upgrade if any contains rows, drops empty retired tables, and records version 15. Newer versions and older versions without an intermediate version 14 upgrade are rejected. Export or archive any retired data separately before retrying; do not clear populated tables just to make an upgrade pass.

For backup, stop web and worker. Checkpoint each SQLite database with `PRAGMA wal_checkpoint(TRUNCATE)`, close it, then copy the application database, studio catalogue database, and `StudioMediaStore` root to a durable backup directory. Restore them together to a stopped instance. Check database integrity, schema version, studio row counts, and representative media hashes before resuming. Keep backups and agent keys outside version control.

Use persistent storage for web, worker, databases, and media, with separate durable backups. A live deployment backup drill remains a Phase 10 check. Restoring local files does not reverse on-chain transactions; reconcile contract events before resuming payment operations.
