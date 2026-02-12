FROM python:3.11-alpine

# Install MongoDB tools and cron
RUN apk add --no-cache \
    mongodb-tools \
    dcron \
    busybox-suid

# Install Python dependencies
RUN pip install --no-cache-dir pyyaml

# Create backup directory
RUN mkdir -p /backups /scripts

# Copy backup script
COPY docker/backup/scripts/backup.py /scripts/
COPY docker/backup/scripts/backup.sh /scripts/
RUN chmod +x /scripts/backup.sh

# Add crontab
COPY docker/backup/scripts/crontab /etc/crontabs/root

# Create log file
RUN touch /var/log/cron.log

CMD crond -f -l 2
