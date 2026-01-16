#!/usr/bin/env python3
import subprocess
import os
from datetime import datetime, timedelta
from pathlib import Path

# ===== config =====
DB_NAME = "bude"                  # <-- your db
BACKUP_DIR = "mongo_backups"
KEEP_DAYS = 14                    # retention
MONGO_URI = "mongodb://127.0.0.1:27017"  # adjust if needed
# ==================

# Generate timestamp
ts = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
out_dir = f"{BACKUP_DIR}/{DB_NAME}_{ts}"
archive = f"{out_dir}.archive.gz"

# Create backup directory
Path(BACKUP_DIR).mkdir(parents=True, exist_ok=True)

# Create a compressed archive dump
print(f"Creating backup: {archive}")
subprocess.run([
    "mongodump",
    f"--uri={MONGO_URI}",
    f"--db={DB_NAME}",
    f"--archive={archive}",
    "--gzip"
], check=True)

# Verify file exists and show size
result = subprocess.run(["ls", "-lh", archive], capture_output=True, text=True)
print(result.stdout)

# Delete old backups
backup_path = Path(BACKUP_DIR)
cutoff_time = datetime.now() - timedelta(days=KEEP_DAYS)

for backup_file in backup_path.glob(f"{DB_NAME}_*.archive.gz"):
    file_mtime = datetime.fromtimestamp(backup_file.stat().st_mtime)
    if file_mtime < cutoff_time:
        print(f"Deleting old backup: {backup_file}")
        backup_file.unlink()

print("Backup completed successfully!")
