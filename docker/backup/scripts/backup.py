#!/usr/bin/env python3
import os
import subprocess
import datetime
import shutil
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

def run_backup():
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_dir = f"/backups/backup_{timestamp}"
    
    try:
        # Create backup directory
        os.makedirs(backup_dir, exist_ok=True)
        
        # MongoDB backup
        print(f"Starting MongoDB backup at {timestamp}")
        subprocess.run([
            "mongodump",
            "--uri=mongodb://mongodb:27017/TournamentDB",
            f"--out={backup_dir}/mongo"
        ], check=True)
        
        # Copy uploaded files
        print("Backing up uploaded files...")
        if os.path.exists("/uploads"):
            shutil.copytree("/uploads", f"{backup_dir}/uploads")
        
        # Create compressed archive
        archive_path = f"/backups/backup_{timestamp}.tar.gz"
        subprocess.run([
            "tar", "-czf", archive_path, 
            "-C", "/backups", 
            f"backup_{timestamp}"
        ], check=True)
        
        # Remove uncompressed backup
        shutil.rmtree(backup_dir)
        
        # Clean old backups
        cleanup_old_backups()
        
        # Send email notification
        send_email_notification(True, archive_path, timestamp)
        
        print(f"Backup completed successfully: {archive_path}")
        
    except Exception as e:
        print(f"Backup failed: {str(e)}")
        send_email_notification(False, None, timestamp, str(e))

def cleanup_old_backups():
    retention_days = int(os.getenv('BACKUP_RETENTION_DAYS', 14))
    cutoff_date = datetime.datetime.now() - datetime.timedelta(days=retention_days)
    
    for filename in os.listdir("/backups"):
        if filename.startswith("backup_") and filename.endswith(".tar.gz"):
            filepath = os.path.join("/backups", filename)
            file_time = datetime.datetime.fromtimestamp(os.path.getmtime(filepath))
            
            if file_time < cutoff_date:
                os.remove(filepath)
                print(f"Removed old backup: {filename}")

def send_email_notification(success, backup_path, timestamp, error_msg=None):
    # Read password from Docker secret
    try:
        with open('/run/secrets/mail_password', 'r') as f:
            password = f.read().strip()
    except:
        print("Warning: Could not read mail password from Docker secret")
        return
    
    smtp_host = os.getenv('SMTP_HOST', 'smtp.strato.de')
    smtp_port = int(os.getenv('SMTP_PORT', 587))
    smtp_user = os.getenv('SMTP_USER')
    email_to = os.getenv('BACKUP_EMAIL_TO')
    email_from = os.getenv('BACKUP_EMAIL_FROM', smtp_user)
    
    if not all([smtp_user, email_to]):
        print("Email configuration incomplete, skipping notification")
        return
    
    msg = MIMEMultipart()
    msg['From'] = email_from
    msg['To'] = email_to
    msg['Subject'] = f"Tournament-Planner Backup {'Success' if success else 'FAILED'} - {timestamp}"
    
    if success:
        body = f"""
Backup completed successfully.

Timestamp: {timestamp}
Backup file: {os.path.basename(backup_path)}
File size: {os.path.getsize(backup_path) / (1024*1024):.2f} MB

This backup will be retained for {os.getenv('BACKUP_RETENTION_DAYS', 14)} days.
"""
    else:
        body = f"""
BACKUP FAILED!

Timestamp: {timestamp}
Error: {error_msg}

Please investigate immediately.
"""
    
    msg.attach(MIMEText(body, 'plain'))
    
    try:
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, password)
        server.send_message(msg)
        server.quit()
        print("Email notification sent successfully")
    except Exception as e:
        print(f"Failed to send email: {str(e)}")

if __name__ == "__main__":
    run_backup()
