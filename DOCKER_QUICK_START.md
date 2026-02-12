# Docker Setup Quick Start Guide

This guide provides quick steps to get your Docker environment up and running.

## Prerequisites

- Docker installed
- Docker Compose installed
- Your domain DNS pointing to the server

## Setup Steps

### 1. Create Secret Files

```bash
# Copy example files
cp docker/secrets/jwt_secret.txt.example docker/secrets/jwt_secret.txt
cp docker/secrets/mail_password.txt.example docker/secrets/mail_password.txt

# Edit with your actual secrets
nano docker/secrets/jwt_secret.txt
nano docker/secrets/mail_password.txt

# Set proper permissions
chmod 600 docker/secrets/*.txt
```

### 2. Configure Environment

Edit `.env` file and update:
- `LETSENCRYPT_EMAIL` - Your email for Let's Encrypt
- `BACKUP_EMAIL_TO` - Where to send backup notifications
- `SMTP_USER` - Your SMTP username

### 3. Development Mode (Local Testing)

```bash
# Build containers
docker compose build

# Start services
docker compose up -d

# View logs
docker compose logs -f

# Access app at http://localhost:3000
```

### 4. Production Deployment

**First-time SSL certificate setup:**

```bash
# Temporarily comment out the HTTPS server block in docker/nginx/conf/default.conf
# (lines with ssl_certificate paths)

# Start nginx only
docker compose -f docker-compose.prod.yml up -d nginx

# Get SSL certificate
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email YOUR_EMAIL@budescharfeseck.de \
  --agree-tos \
  --no-eff-email \
  -d budescharfeseck.de \
  -d www.budescharfeseck.de

# Uncomment SSL server block in docker/nginx/conf/default.conf

# Start all services
docker compose -f docker-compose.prod.yml up -d
```

**Subsequent deployments:**

```bash
# Start all services
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f
```

## Common Commands

### Service Management
```bash
# Start services
docker compose -f docker-compose.prod.yml up -d

# Stop services
docker compose -f docker-compose.prod.yml down

# Restart a service
docker compose -f docker-compose.prod.yml restart app

# View logs
docker compose -f docker-compose.prod.yml logs -f app

# Check service status
docker compose -f docker-compose.prod.yml ps
```

### Database Operations
```bash
# Access MongoDB shell
docker compose -f docker-compose.prod.yml exec mongodb mongosh

# Manual backup
docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh

# Import existing data
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongorestore --drop /backups/your-backup-folder
```

### SSL Certificate Renewal
```bash
# Manual renewal
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml restart nginx
```

### Maintenance
```bash
# View resource usage
docker stats

# Clean up unused Docker resources
docker system prune -a

# Update to latest images
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker compose -f docker-compose.prod.yml logs app

# Check if port is already in use
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :443
```

### 502 Bad Gateway
```bash
# Check if app container is healthy
docker compose -f docker-compose.prod.yml ps

# Test app health endpoint
docker compose -f docker-compose.prod.yml exec app curl localhost:3000/health
```

### WebSocket not connecting
```bash
# Check Nginx logs
docker compose -f docker-compose.prod.yml logs nginx | grep -i upgrade

# Verify proxy settings
docker compose -f docker-compose.prod.yml exec nginx nginx -T | grep socket.io
```

## Next Steps

After deployment:
1. Test all functionality (login, file upload, WebSocket, etc.)
2. Set up SSL auto-renewal cron job (see DOCKER_MIGRATION_PLAN.md)
3. Configure monitoring
4. Test backup and restore procedures

For detailed information, see `DOCKER_MIGRATION_PLAN.md`
