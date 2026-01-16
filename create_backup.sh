#!/usr/bin/env bash
set -euo pipefail

# ===== config =====
DB_NAME="bude"                  # <-- your db
BACKUP_DIR="mongo_backups"
KEEP_DAYS=14                    # retention
MONGO_URI="mongodb://127.0.0.1:27017"  # adjust if needed
# ==================

ts="$(date +'%Y-%m-%d_%H-%M-%S')"
out_dir="${BACKUP_DIR}/${DB_NAME}_${ts}"
archive="${out_dir}.archive.gz"

mkdir -p "$BACKUP_DIR"

# Create a compressed archive dump
mongodump \
  --uri="$MONGO_URI" \
  --db="$DB_NAME" \
  --archive="$archive" \
  --gzip

# Verify file exists + show size
ls -lh "$archive"

# Delete old backups
find "$BACKUP_DIR" -type f -name "${DB_NAME}_*.archive.gz" -mtime +"$KEEP_DAYS" -delete
