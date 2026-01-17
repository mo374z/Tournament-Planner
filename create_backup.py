#!/usr/bin/env python3
import subprocess
from pathlib import Path
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import os
from datetime import datetime, date, timedelta
import zipfile
import re
from decimal import Decimal
import yaml

# ===== config =====
DB_NAME = "bude"                  # <-- your db
BACKUP_DIR = "mongo_backups"
KEEP_DAYS = 14                    # retention
MONGO_URI = "mongodb://127.0.0.1:27017"  # adjust if needed
# ==================

# Load password from keytokens.yaml
with open('/home/bude/Tournament-Planner/keytokens.yaml', 'r') as f:
    tokens = yaml.safe_load(f)
    mail_password = tokens['mailpassword']

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


def send_account_overview(sender_email, receiver_email, password, zip_path):

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    # Sicherstellen, dass der Backup-Ordner existiert



    body = f"Hurensohn Backup Shit vom {timestamp}"

    body += "\n Gruss von Marc"




    if not os.path.isfile(zip_path):
        raise FileNotFoundError(f"File not found: {zip_path}")

    with open(zip_path, "rb") as f:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(f.read())

    encoders.encode_base64(part)

    part.add_header(
        "Content-Disposition",
        f'attachment; filename="{os.path.basename(zip_path)}"'
    )
    # E-Mail zusammenbauen
    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = ", ".join(receiver_email)
    msg['Subject'] = f"Budeturnier Backup {timestamp}"
    msg.attach(MIMEText(body, 'plain'))
    msg.attach(part)

    # E-Mail senden
    try:
        server = smtplib.SMTP_SSL('smtp.strato.de', 465)  # SSL-Port
        server.login(sender_email, password)
        server.sendmail(sender_email, receiver_email, msg.as_string())
        server.quit()
        print("Backup E-Mail erfolgreich gesendet! " + str(datetime.now()))
    except Exception as e:
        print("Fehler beim Senden der E-Mail:" + str(datetime.now()), e)
        
    print(f"Backup completed successfully!{timestamp}")



send_account_overview(
    sender_email="info@gretzinger.net",
    receiver_email=["schlager.mo.home@gmail.com","marc.gretzinger@gmail.com"],
    password=mail_password,
    zip_path=archive
)




