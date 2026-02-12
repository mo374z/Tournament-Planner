# Tournament-Planner Docker Migration Plan

## Executive Summary

This document outlines the complete migration plan to containerize Tournament-Planner using Docker with production-ready infrastructure including Nginx reverse proxy, Let's Encrypt SSL, and ModSecurity WAF.

**Target Architecture:**
- Docker Compose orchestration
- Nginx reverse proxy with Let's Encrypt auto-renewal
- ModSecurity + OWASP CRS for security (SQL injection, XSS, DDoS protection)
- MongoDB in container with persistent volumes
- Node.js application container
- Separate backup service container
- All internal communication via HTTP
- Only Nginx exposed (ports 80/443)

**Domain:** budescharfeseck.de

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Container Definitions](#container-definitions)
3. [Network Architecture](#network-architecture)
4. [Security Implementation](#security-implementation)
5. [Data Persistence Strategy](#data-persistence-strategy)
6. [Migration Steps](#migration-steps)
7. [Configuration Files to Create](#configuration-files-to-create)
8. [Code Changes Required](#code-changes-required)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Procedure](#deployment-procedure)
11. [Rollback Plan](#rollback-plan)
12. [Maintenance & Operations](#maintenance--operations)

---

## 1. Architecture Overview

### Current Architecture
```
Internet → HTTPS (2443) → Node.js App (index.js)
                        ↓
                    MongoDB (0.0.0.0:27017)
```

### Target Architecture
```
Internet (443/80)
    ↓
┌─────────────────────────────────────────┐
│ Nginx Reverse Proxy + ModSecurity       │
│ - SSL Termination (Let's Encrypt)       │
│ - Static file serving                   │
│ - WebSocket upgrade handling            │
│ - WAF (OWASP CRS)                       │
└─────────────┬───────────────────────────┘
              │ HTTP (internal network)
              ↓
┌─────────────────────────────────────────┐
│ Node.js App Container                   │
│ - Express server (HTTP only)            │
│ - Socket.IO server                      │
│ - Business logic                        │
└─────────────┬───────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────┐
│ MongoDB Container                       │
│ - Database                              │
│ - Named volume for data                 │
└─────────────────────────────────────────┘
              ↑
┌─────────────┴───────────────────────────┐
│ Backup Service Container (cron)         │
│ - Scheduled backups                     │
│ - Email delivery                        │
└─────────────────────────────────────────┘
```

---

## 2. Container Definitions

### 2.1 Nginx Container
- **Base Image:** `nginx:alpine` with ModSecurity module OR `owasp/modsecurity-crs:nginx-alpine`
- **Purpose:** Reverse proxy, SSL termination, static files, WAF
- **Exposed Ports:** 80, 443
- **Volumes:**
  - SSL certificates (Let's Encrypt)
  - Nginx config
  - Static files (read-only)
  - ModSecurity logs

### 2.2 Node.js Application Container
- **Base Image:** `node:18-alpine` or `node:20-alpine`
- **Purpose:** Run Tournament-Planner Express app
- **Exposed Ports:** 3000 (internal only)
- **Volumes:**
  - Uploaded files (teamlogos, teampictures)
  - Application logs
- **Environment Variables:**
  - `NODE_ENV=production`
  - `PORT=3000`
  - `MONGODB_URI=mongodb://mongodb:27017/TournamentDB`
  - JWT secret, mail password (via Docker secrets)

### 2.3 MongoDB Container
- **Base Image:** `mongo:7` or `mongo:latest`
- **Purpose:** Database
- **Exposed Ports:** 27017 (internal only)
- **Volumes:**
  - Named volume for `/data/db`
  - Backup volume for exports
- **Configuration:**
  - Optional authentication (recommended for production)

### 2.4 Backup Service Container
- **Base Image:** `python:3.11-alpine`
- **Purpose:** Scheduled backups via cron
- **Volumes:**
  - Backup storage volume
  - MongoDB backup access
- **Dependencies:** MongoDB tools, SMTP libraries

### 2.5 Certbot Container (Optional - for cert management)
- **Base Image:** `certbot/certbot`
- **Purpose:** Let's Encrypt certificate renewal
- **Volumes:**
  - Shared with Nginx for cert storage
  - Webroot for ACME challenge

---

## 3. Network Architecture

### Docker Networks
1. **frontend** (bridge network)
   - Nginx ↔ Node.js communication
   
2. **backend** (bridge network)
   - Node.js ↔ MongoDB communication
   - Backup ↔ MongoDB communication

### Port Mapping
- **Host → Nginx:** 80:80, 443:443
- **Internal:**
  - Nginx → Node.js: 3000
  - Node.js → MongoDB: 27017
  - Backup → MongoDB: 27017

### DNS/Service Discovery
- Docker Compose automatic DNS: `http://app:3000`, `mongodb://mongodb:27017`

---

## 4. Security Implementation

### 4.1 ModSecurity + OWASP CRS

**Protection Against:**
- SQL Injection
- XSS (Cross-Site Scripting)
- Path Traversal
- Command Injection
- HTTP Protocol Violations
- DDoS (rate limiting)

**Configuration:**
- Paranoia Level: 1 (recommended for start, increase to 2/3 for stricter)
- Anomaly Scoring Mode
- Request body inspection
- Response body inspection (optional, performance impact)

**Custom Rules:**
- Rate limiting: 100 requests/min per IP
- Request size limits
- File upload size limits (already handled by Multer, but add layer)

### 4.2 Fail2ban Integration (Optional)
- Monitor Nginx access logs
- Ban IPs with suspicious patterns
- Integrate with ModSecurity audit logs

### 4.3 Additional Security Measures
- No MongoDB port exposed to internet
- Docker secrets for sensitive data (JWT, passwords)
- Read-only file systems where possible
- Non-root user in containers
- Network isolation (frontend/backend separation)
- Regular security updates via base image updates

---

## 5. Data Persistence Strategy

### Docker Volumes (Named)

1. **mongodb_data**
   - MongoDB database files
   - Critical - must be backed up

2. **mongodb_backups**
   - Backup exports (mongodump output)
   - Retention: 14 days

3. **app_uploads**
   - `/public/teamlogos`
   - `/public/teampictures`
   - Should be backed up

4. **app_logs**
   - Application logs
   - Nginx access/error logs
   - ModSecurity audit logs

5. **letsencrypt_certs**
   - SSL certificates
   - Let's Encrypt account data

6. **letsencrypt_www**
   - Webroot for ACME challenge

### Backup Strategy
- **What:** MongoDB data, uploaded files, certificates
- **When:** Daily at 3 AM (configurable)
- **Retention:** 14 days
- **Storage:** Volume + optional S3/external
- **Method:** mongodump + tar archives
- **Notification:** Email on completion/failure

---

## 6. Migration Steps

### Phase 1: Preparation (No Downtime)
**Duration:** 2-4 hours

- [ ] **Step 1.1:** Install Docker & Docker Compose on server
  ```bash
  # Ubuntu/Debian
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  sudo usermod -aG docker $USER
  sudo apt-get install docker-compose-plugin
  ```

- [ ] **Step 1.2:** Verify DNS points to server
  ```bash
  nslookup budescharfeseck.de
  # Should resolve to your server IP
  ```

- [ ] **Step 1.3:** Backup current system
  ```bash
  # Full MongoDB backup
  mongodump --out=/backup/pre-docker-migration
  
  # Backup uploaded files
  tar -czf /backup/uploads-backup.tar.gz public/teamlogos public/teampictures
  
  # Backup config
  cp keytokens.yaml /backup/keytokens.yaml.bak
  ```

- [ ] **Step 1.4:** Create project directory structure
  ```bash
  mkdir -p docker/{nginx,app,backup,mongo}
  mkdir -p docker/nginx/{conf,ssl,modsecurity}
  mkdir -p docker/backup/scripts
  ```

### Phase 2: Configuration Files (No Downtime)
**Duration:** 3-5 hours

- [ ] **Step 2.1:** Create Dockerfile for Node.js app (see section 7.1)
- [ ] **Step 2.2:** Create Dockerfile for backup service (see section 7.2)
- [ ] **Step 2.3:** Create docker-compose.yml (see section 7.3)
- [ ] **Step 2.4:** Create docker-compose.prod.yml (see section 7.4)
- [ ] **Step 2.5:** Create Nginx configuration (see section 7.5)
- [ ] **Step 2.6:** Create ModSecurity configuration (see section 7.6)
- [ ] **Step 2.7:** Create .env file (see section 7.7)
- [ ] **Step 2.8:** Create .dockerignore (see section 7.8)
- [ ] **Step 2.9:** Create Docker secrets files (see section 7.9)

### Phase 3: Code Modifications (No Downtime)
**Duration:** 1-2 hours

- [ ] **Step 3.1:** Update MongoDB connection string in code (see section 8.1)
- [ ] **Step 3.2:** Remove HTTPS server code from index.js (see section 8.2)
- [ ] **Step 3.3:** Update Socket.IO configuration (see section 8.3)
- [ ] **Step 3.4:** Update file upload paths (see section 8.4)
- [ ] **Step 3.5:** Add health check endpoint (see section 8.5)
- [ ] **Step 3.6:** Update keytokens.yaml loading (see section 8.6)

### Phase 4: Testing (Local/Staging)
**Duration:** 2-4 hours

- [ ] **Step 4.1:** Build containers locally
  ```bash
  docker compose -f docker-compose.yml build
  ```

- [ ] **Step 4.2:** Start services in development mode
  ```bash
  docker compose -f docker-compose.yml up -d
  ```

- [ ] **Step 4.3:** Test application functionality (see section 9)
- [ ] **Step 4.4:** Test ModSecurity rules
- [ ] **Step 4.5:** Test backup service
- [ ] **Step 4.6:** Fix any issues found

### Phase 5: Production Deployment (Downtime Required)
**Duration:** 30-60 minutes downtime

- [ ] **Step 5.1:** Announce maintenance window to users

- [ ] **Step 5.2:** Stop current application
  ```bash
  # Find and kill node process
  pkill -f "node index.js"
  ```

- [ ] **Step 5.3:** Final backup
  ```bash
  mongodump --out=/backup/final-pre-docker
  ```

- [ ] **Step 5.4:** Copy uploaded files to Docker volume location
  ```bash
  # Will be handled by volume initialization
  ```

- [ ] **Step 5.5:** Initialize Let's Encrypt certificates
  ```bash
  # Temporary Nginx config for ACME challenge
  docker compose -f docker-compose.prod.yml up -d nginx
  
  # Get certificates
  docker compose -f docker-compose.prod.yml run --rm certbot \
    certonly --webroot \
    --webroot-path=/var/www/certbot \
    --email your-email@example.com \
    --agree-tos \
    --no-eff-email \
    -d budescharfeseck.de \
    -d www.budescharfeseck.de
  ```

- [ ] **Step 5.6:** Update Nginx config to use SSL, restart
  ```bash
  # Uncomment SSL server block in nginx.conf
  docker compose -f docker-compose.prod.yml restart nginx
  ```

- [ ] **Step 5.7:** Start all services
  ```bash
  docker compose -f docker-compose.prod.yml up -d
  ```

- [ ] **Step 5.8:** Verify all services healthy
  ```bash
  docker compose -f docker-compose.prod.yml ps
  docker compose -f docker-compose.prod.yml logs -f
  ```

- [ ] **Step 5.9:** Test application through Nginx
  - Access https://budescharfeseck.de
  - Test login
  - Test WebSocket connection (live game)
  - Test file upload
  - Test database operations

- [ ] **Step 5.10:** Announce service restored

### Phase 6: Post-Migration
**Duration:** Ongoing

- [ ] **Step 6.1:** Monitor logs for 24 hours
  ```bash
  docker compose -f docker-compose.prod.yml logs -f app
  docker compose -f docker-compose.prod.yml logs -f nginx
  ```

- [ ] **Step 6.2:** Set up automatic Docker start on boot
  ```bash
  # Add to crontab
  @reboot cd /path/to/Tournament-Planner && docker compose -f docker-compose.prod.yml up -d
  ```

- [ ] **Step 6.3:** Configure backup monitoring
- [ ] **Step 6.4:** Set up SSL renewal automation (cron)
  ```bash
  # Add to crontab
  0 3 * * 1 cd /path/to/Tournament-Planner && docker compose -f docker-compose.prod.yml run --rm certbot renew && docker compose -f docker-compose.prod.yml restart nginx
  ```

- [ ] **Step 6.5:** Document new operational procedures
- [ ] **Step 6.6:** Remove old MongoDB data after 30 days verification period

---

## 7. Configuration Files to Create

### 7.1 Dockerfile (Node.js App)
**Location:** `docker/app/Dockerfile`

```dockerfile
FROM node:20-alpine

# Install dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /usr/src/app

# Create directories for uploads with correct permissions
RUN mkdir -p public/teamlogos public/teampictures && \
    chown -R nodejs:nodejs public

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "index.js"]
```

### 7.2 Dockerfile (Backup Service)
**Location:** `docker/backup/Dockerfile`

```dockerfile
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
```

### 7.3 docker-compose.yml (Development)
**Location:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    container_name: tournament-mongodb-dev
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data_dev:/data/db
      - mongodb_backups_dev:/backups
    networks:
      - backend
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: docker/app/Dockerfile
    container_name: tournament-app-dev
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
      - MONGODB_URI=mongodb://mongodb:27017/TournamentDB
    volumes:
      - ./:/usr/src/app
      - /usr/src/app/node_modules
      - app_uploads_dev:/usr/src/app/public/teamlogos
      - app_uploads_dev:/usr/src/app/public/teampictures
      - app_logs_dev:/usr/src/app/logs
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - backend
      - frontend

volumes:
  mongodb_data_dev:
    driver: local
  mongodb_backups_dev:
    driver: local
  app_uploads_dev:
    driver: local
  app_logs_dev:
    driver: local

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
```

### 7.4 docker-compose.prod.yml (Production)
**Location:** `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  nginx:
    image: owasp/modsecurity-crs:nginx-alpine
    container_name: tournament-nginx-prod
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/conf/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./docker/nginx/conf/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./docker/nginx/modsecurity/modsecurity.conf:/etc/modsecurity.d/modsecurity.conf:ro
      - ./docker/nginx/modsecurity/custom-rules.conf:/etc/modsecurity.d/custom-rules.conf:ro
      - ./public:/usr/share/nginx/html/public:ro
      - ./src/public:/usr/share/nginx/html/src/public:ro
      - letsencrypt_certs:/etc/letsencrypt:ro
      - letsencrypt_www:/var/www/certbot:ro
      - nginx_logs:/var/log/nginx
      - modsec_logs:/var/log/modsec
    depends_on:
      app:
        condition: service_healthy
    networks:
      - frontend
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  app:
    build:
      context: .
      dockerfile: docker/app/Dockerfile
    container_name: tournament-app-prod
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MONGODB_URI=mongodb://mongodb:27017/TournamentDB
    secrets:
      - jwt_secret
      - mail_password
    volumes:
      - app_uploads:/usr/src/app/public/teamlogos
      - app_uploads:/usr/src/app/public/teampictures
      - app_logs:/usr/src/app/logs
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - backend
      - frontend
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3

  mongodb:
    image: mongo:7
    container_name: tournament-mongodb-prod
    restart: unless-stopped
    volumes:
      - mongodb_data:/data/db
      - mongodb_backups:/backups
    networks:
      - backend
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  backup:
    build:
      context: .
      dockerfile: docker/backup/Dockerfile
    container_name: tournament-backup-prod
    restart: unless-stopped
    environment:
      - MONGODB_URI=mongodb://mongodb:27017
      - BACKUP_RETENTION_DAYS=14
    secrets:
      - mail_password
    volumes:
      - mongodb_backups:/backups
      - app_uploads:/uploads:ro
      - ./docker/backup/scripts:/scripts:ro
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - backend

  certbot:
    image: certbot/certbot
    container_name: tournament-certbot
    volumes:
      - letsencrypt_certs:/etc/letsencrypt
      - letsencrypt_www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

volumes:
  mongodb_data:
    driver: local
  mongodb_backups:
    driver: local
  app_uploads:
    driver: local
  app_logs:
    driver: local
  nginx_logs:
    driver: local
  modsec_logs:
    driver: local
  letsencrypt_certs:
    driver: local
  letsencrypt_www:
    driver: local

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

secrets:
  jwt_secret:
    file: ./docker/secrets/jwt_secret.txt
  mail_password:
    file: ./docker/secrets/mail_password.txt
```

### 7.5 Nginx Configuration
**Location:** `docker/nginx/conf/nginx.conf`

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 2048;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript 
               application/json application/javascript application/xml+rss 
               application/rss+xml font/truetype font/opentype 
               application/vnd.ms-fontobject image/svg+xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=general:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=api:10m rate=50r/m;
    limit_conn_zone $binary_remote_addr zone=addr:10m;

    include /etc/nginx/conf.d/*.conf;
}
```

**Location:** `docker/nginx/conf/default.conf`

```nginx
# Upstream for Node.js app
upstream app_backend {
    server app:3000;
    keepalive 32;
}

# HTTP server - redirect to HTTPS
server {
    listen 80;
    server_name budescharfeseck.de www.budescharfeseck.de;

    # Let's Encrypt ACME challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other HTTP traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name budescharfeseck.de www.budescharfeseck.de;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/budescharfeseck.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/budescharfeseck.de/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # ModSecurity
    modsecurity on;
    modsecurity_rules_file /etc/modsecurity.d/include.conf;

    # Rate limiting
    limit_req zone=general burst=20 nodelay;
    limit_conn addr 10;

    # Static files - served directly by Nginx
    location /public/ {
        alias /usr/share/nginx/html/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /src/public/ {
        alias /usr/share/nginx/html/src/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint (bypass ModSecurity)
    location /health {
        modsecurity off;
        proxy_pass http://app_backend;
        access_log off;
    }

    # WebSocket upgrade for Socket.IO
    location /socket.io/ {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # WebSocket timeout
        proxy_read_timeout 86400;
    }

    # Proxy all other requests to Node.js app
    location / {
        proxy_pass http://app_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffering
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
    }

    # Error pages
    error_page 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

### 7.6 ModSecurity Configuration
**Location:** `docker/nginx/modsecurity/modsecurity.conf`

```
# ModSecurity Configuration

# Enable ModSecurity
SecRuleEngine On

# Request body handling
SecRequestBodyAccess On
SecRequestBodyLimit 52428800
SecRequestBodyNoFilesLimit 131072

# Response body handling (disable for performance)
SecResponseBodyAccess Off
SecResponseBodyLimit 524288

# File uploads
SecTmpDir /tmp/
SecDataDir /tmp/

# Debug log
SecDebugLog /var/log/modsec/debug.log
SecDebugLogLevel 0

# Audit log
SecAuditEngine RelevantOnly
SecAuditLogRelevantStatus "^(?:5|4(?!04))"
SecAuditLogParts ABIJDEFHZ
SecAuditLogType Serial
SecAuditLog /var/log/modsec/audit.log

# Paranoia Level (1-4, higher = stricter)
SecAction \
  "id:900000,\
   phase:1,\
   nolog,\
   pass,\
   t:none,\
   setvar:tx.paranoia_level=1"

# Anomaly Scoring
SecAction \
  "id:900110,\
   phase:1,\
   nolog,\
   pass,\
   t:none,\
   setvar:tx.inbound_anomaly_score_threshold=5,\
   setvar:tx.outbound_anomaly_score_threshold=4"

# Include OWASP CRS
Include /etc/modsecurity.d/owasp-crs/crs-setup.conf
Include /etc/modsecurity.d/owasp-crs/rules/*.conf

# Include custom rules
Include /etc/modsecurity.d/custom-rules.conf
```

**Location:** `docker/nginx/modsecurity/custom-rules.conf`

```
# Custom ModSecurity Rules for Tournament-Planner

# Allow larger file uploads for team pictures/logos
SecRule REQUEST_URI "@contains /team/uploadImage" \
    "id:1001,\
     phase:1,\
     t:none,\
     nolog,\
     pass,\
     ctl:requestBodyLimit=52428800"

SecRule REQUEST_URI "@contains /team/uploadLogo" \
    "id:1002,\
     phase:1,\
     t:none,\
     nolog,\
     pass,\
     ctl:requestBodyLimit=52428800"

# Whitelist health check endpoint
SecRule REQUEST_URI "@streq /health" \
    "id:1003,\
     phase:1,\
     t:none,\
     nolog,\
     pass,\
     ctl:ruleEngine=Off"

# Rate limiting for login endpoints
SecRule REQUEST_URI "@contains /login" \
    "id:1004,\
     phase:2,\
     deny,\
     status:429,\
     msg:'Login rate limit exceeded',\
     chain"
    SecRule &IP:login_attempts "@gt 5"

# Block common attack patterns specific to this app
SecRule ARGS "@contains mongod" \
    "id:1005,\
     phase:2,\
     deny,\
     status:403,\
     msg:'MongoDB injection attempt'"
```

### 7.7 Environment File
**Location:** `.env`

```env
# Application
NODE_ENV=production
PORT=3000

# MongoDB
MONGODB_URI=mongodb://mongodb:27017/TournamentDB

# Domain
DOMAIN=budescharfeseck.de

# Email for Let's Encrypt
LETSENCRYPT_EMAIL=admin@budescharfeseck.de

# Backup configuration
BACKUP_RETENTION_DAYS=14
BACKUP_EMAIL_TO=admin@budescharfeseck.de
BACKUP_EMAIL_FROM=noreply@budescharfeseck.de

# SMTP Settings for backup emails
SMTP_HOST=smtp.strato.de
SMTP_PORT=587
SMTP_USER=your-email@budescharfeseck.de

# DO NOT PUT SECRETS HERE - USE DOCKER SECRETS
```

### 7.8 .dockerignore
**Location:** `.dockerignore`

```
node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
docker-compose*.yml
Dockerfile
docker/
mongo_backups/
*.md
.vscode/
.idea/
*.log
keytokens.yaml
privkey1.pem
cert1.pem
```

### 7.9 Docker Secrets
**Location:** `docker/secrets/jwt_secret.txt`
```
your-jwt-secret-key-here-minimum-32-characters-long
```

**Location:** `docker/secrets/mail_password.txt`
```
your-email-password-here
```

**Note:** These files should have restricted permissions:
```bash
chmod 600 docker/secrets/*.txt
```

### 7.10 Backup Script
**Location:** `docker/backup/scripts/backup.py`

```python
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
```

**Location:** `docker/backup/scripts/backup.sh`
```bash
#!/bin/sh
cd /scripts
python3 backup.py
```

**Location:** `docker/backup/scripts/crontab`
```
# Run backup daily at 3 AM
0 3 * * * /scripts/backup.sh >> /var/log/cron.log 2>&1
```

---

## 8. Code Changes Required

### 8.1 MongoDB Connection String
**File:** `index.js`

**Current:**
```javascript
const dbUrl = "mongodb://0.0.0.0:27017/TournamentDB";
```

**Change to:**
```javascript
const dbUrl = process.env.MONGODB_URI || "mongodb://0.0.0.0:27017/TournamentDB";
```

### 8.2 Remove HTTPS Server Code
**File:** `index.js`

**Current:**
```javascript
const https = require('https');
const fs = require('fs');

if (args.https) {
    const privateKey = fs.readFileSync('privkey1.pem', 'utf8');
    const certificate = fs.readFileSync('cert1.pem', 'utf8');
    const credentials = { key: privateKey, cert: certificate };
    const httpsServer = https.createServer(credentials, app);
    // ... https server setup
}
```

**Change to:**
```javascript
// HTTPS is handled by Nginx reverse proxy
// Remove all HTTPS server code
```

**Update server start:**
```javascript
// Always use HTTP inside Docker
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});
```

### 8.3 Socket.IO Configuration
**File:** `src/config/socketConfig.js`

**Current:**
```javascript
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
```

**Change to:**
```javascript
const io = require('socket.io')(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    },
    // Trust proxy for WebSocket upgrades through Nginx
    transports: ['websocket', 'polling'],
    allowEIO3: true
});
```

### 8.4 File Upload Paths
**File:** Controllers with file uploads (e.g., `src/controllers/TeamController.js`)

**Ensure paths are relative and work in container:**
```javascript
// Should already be correct, but verify:
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/teamlogos/') // Relative path is fine
    },
    // ...
});
```

### 8.5 Add Health Check Endpoint
**File:** `index.js`

**Add before routes:**
```javascript
// Health check endpoint for Docker
app.get('/health', (req, res) => {
    // Check MongoDB connection
    const dbState = mongoose.connection.readyState;
    if (dbState !== 1) {
        return res.status(503).json({ 
            status: 'unhealthy', 
            database: 'disconnected' 
        });
    }
    
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
```

### 8.6 Update keytokens.yaml Loading
**File:** All files that load `keytokens.yaml`

**Current:**
```javascript
const yamlData = yaml.load(fs.readFileSync('keytokens.yaml', 'utf8'));
```

**Change to (support Docker secrets):**
```javascript
let jwtSecret, mailPassword;

// Try Docker secrets first
try {
    jwtSecret = fs.readFileSync('/run/secrets/jwt_secret', 'utf8').trim();
    mailPassword = fs.readFileSync('/run/secrets/mail_password', 'utf8').trim();
} catch (err) {
    // Fallback to keytokens.yaml for local development
    try {
        const yamlData = yaml.load(fs.readFileSync('keytokens.yaml', 'utf8'));
        jwtSecret = yamlData.jwtSecretkey;
        mailPassword = yamlData.mailpassword;
    } catch (yamlErr) {
        console.error('Could not load secrets from Docker or YAML file');
        process.exit(1);
    }
}

module.exports = { jwtSecretkey: jwtSecret, mailpassword: mailPassword };
```

### 8.7 Trust Proxy Settings
**File:** `index.js`

**Add after Express initialization:**
```javascript
// Trust Nginx reverse proxy
app.set('trust proxy', 1);
```

This ensures correct client IPs in logs and rate limiting.

---

## 9. Testing Strategy

### 9.1 Local Testing Checklist

**Infrastructure Tests:**
- [ ] All containers start successfully
- [ ] All containers pass health checks
- [ ] Networks are created correctly
- [ ] Volumes are mounted properly
- [ ] Inter-container communication works

**Functionality Tests:**
- [ ] Home page loads
- [ ] User login works
- [ ] MongoDB connection successful
- [ ] WebSocket connection established (check browser console)
- [ ] Static files load (CSS, JS, images)
- [ ] Team logo upload works
- [ ] Team picture upload works
- [ ] Schedule generation works
- [ ] Live game timer works with WebSocket sync
- [ ] Scorer interface assigns goals correctly
- [ ] Cashier system records sales
- [ ] Certificate generation works (Puppeteer)
- [ ] MyTeam portal accessible with access code
- [ ] Feedback submission works
- [ ] Database switching works
- [ ] Admin settings save correctly

**Security Tests:**
- [ ] ModSecurity blocks SQL injection attempts
  ```bash
  curl "https://budescharfeseck.de/?id=1' OR '1'='1"
  # Should return 403
  ```
- [ ] ModSecurity blocks XSS attempts
  ```bash
  curl "https://budescharfeseck.de/?name=<script>alert('xss')</script>"
  # Should return 403
  ```
- [ ] Rate limiting works
  ```bash
  for i in {1..150}; do curl https://budescharfeseck.de/; done
  # Should get 429 Too Many Requests
  ```
- [ ] HTTPS redirect works (HTTP → HTTPS)
- [ ] SSL certificate valid
- [ ] MongoDB not accessible from outside

**Performance Tests:**
- [ ] Page load times acceptable
- [ ] Static files cached properly (check headers)
- [ ] WebSocket latency acceptable
- [ ] Concurrent users supported (use load testing tool)

### 9.2 Testing Commands

```bash
# Check all services running
docker compose -f docker-compose.prod.yml ps

# Check health status
docker compose -f docker-compose.prod.yml ps | grep healthy

# View logs
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f nginx
docker compose -f docker-compose.prod.yml logs -f mongodb

# Test MongoDB connection
docker compose -f docker-compose.prod.yml exec mongodb mongosh --eval "db.adminCommand('ping')"

# Test app health endpoint
curl http://localhost:3000/health

# Test Nginx proxy
curl -I https://budescharfeseck.de

# Check SSL certificate
openssl s_client -connect budescharfeseck.de:443 -servername budescharfeseck.de

# Test WebSocket
# Use browser console:
# const socket = io('https://budescharfeseck.de');
# socket.on('connect', () => console.log('Connected!'));

# Check ModSecurity logs
docker compose -f docker-compose.prod.yml exec nginx tail -f /var/log/modsec/audit.log

# Monitor resources
docker stats

# Test backup manually
docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh
```

---

## 10. Deployment Procedure

### 10.1 Pre-Deployment Checklist

- [ ] All configuration files created
- [ ] Docker secrets files created with correct permissions
- [ ] DNS points to server IP
- [ ] Server has sufficient resources (2GB+ RAM, 20GB+ disk)
- [ ] Firewall allows ports 80, 443
- [ ] Backup of current system completed
- [ ] Tested in staging/development environment
- [ ] Maintenance window scheduled and announced

### 10.2 Deployment Steps (Detailed)

**Step 1: Server Preparation**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt-get install docker-compose-plugin -y

# Logout and login for group changes
exit
# ssh back in

# Verify installation
docker --version
docker compose version
```

**Step 2: Project Setup**
```bash
cd /home/yourusername
git clone <your-repo-url> Tournament-Planner
cd Tournament-Planner

# Create directory structure
mkdir -p docker/{nginx/{conf,modsecurity},backup/scripts,secrets}

# Copy all configuration files (created in section 7)
# ... copy files as per section 7 ...

# Create secrets files
echo "your-jwt-secret-min-32-chars" > docker/secrets/jwt_secret.txt
echo "your-email-password" > docker/secrets/mail_password.txt
chmod 600 docker/secrets/*.txt

# Create .env file
nano .env
# ... add content from section 7.7 ...
```

**Step 3: Initial Certificate (Let's Encrypt)**
```bash
# Start only Nginx for ACME challenge (comment out SSL server block first)
# Edit docker/nginx/conf/default.conf and comment out the HTTPS server block

docker compose -f docker-compose.prod.yml up -d nginx

# Obtain certificate
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@budescharfeseck.de \
  --agree-tos \
  --no-eff-email \
  -d budescharfeseck.de \
  -d www.budescharfeseck.de

# Uncomment SSL server block in nginx conf
nano docker/nginx/conf/default.conf

# Restart Nginx
docker compose -f docker-compose.prod.yml restart nginx
```

**Step 4: Start All Services**
```bash
# Stop current application
sudo systemctl stop tournament-app  # Or however it's currently running
pkill -f "node index.js"

# Start Docker stack
docker compose -f docker-compose.prod.yml up -d

# Watch logs
docker compose -f docker-compose.prod.yml logs -f
```

**Step 5: Verify Deployment**
```bash
# Check all services healthy
docker compose -f docker-compose.prod.yml ps

# Test health endpoint
curl https://budescharfeseck.de/health

# Check logs for errors
docker compose -f docker-compose.prod.yml logs app | grep -i error
docker compose -f docker-compose.prod.yml logs nginx | grep -i error
```

**Step 6: Initial Data Migration**
```bash
# If you have existing data in MongoDB on host:
# Export from host MongoDB
mongodump --out=/tmp/migration-backup

# Import to Docker MongoDB
docker compose -f docker-compose.prod.yml exec -T mongodb \
  mongorestore --drop /backups/migration-backup

# Copy uploaded files to volumes
docker cp public/teamlogos/. $(docker compose -f docker-compose.prod.yml ps -q app):/usr/src/app/public/teamlogos/
docker cp public/teampictures/. $(docker compose -f docker-compose.prod.yml ps -q app):/usr/src/app/public/teampictures/
```

**Step 7: Configure Auto-Start**
```bash
# Create systemd service
sudo nano /etc/systemd/system/tournament-docker.service
```

Content:
```ini
[Unit]
Description=Tournament-Planner Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/yourusername/Tournament-Planner
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable tournament-docker
```

**Step 8: Setup SSL Auto-Renewal**
```bash
# Add to crontab
crontab -e
```

Add:
```
# Renew SSL certificates weekly
0 3 * * 1 cd /home/yourusername/Tournament-Planner && docker compose -f docker-compose.prod.yml run --rm certbot renew && docker compose -f docker-compose.prod.yml restart nginx
```

---

## 11. Rollback Plan

### 11.1 Immediate Rollback (Within 1 Hour)

If deployment fails:

```bash
# Stop Docker containers
docker compose -f docker-compose.prod.yml down

# Start old application
sudo systemctl start tournament-app
# OR
cd /path/to/old/app
node index.js --https &

# Verify old app works
curl https://budescharfeseck.de
```

### 11.2 Data Rollback

If data corruption occurs:

```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Restore MongoDB from backup
mongorestore --drop /backup/final-pre-docker

# Restore uploaded files
tar -xzf /backup/uploads-backup.tar.gz -C /original/location

# Restart old application
```

### 11.3 Rollback Triggers

Immediately rollback if:
- Application doesn't start within 5 minutes
- Health checks fail after 3 attempts
- Critical functionality broken (login, database access)
- Data loss detected
- Security vulnerability exposed

---

## 12. Maintenance & Operations

### 12.1 Regular Maintenance Tasks

**Daily:**
- [ ] Check container health
  ```bash
  docker compose -f docker-compose.prod.yml ps
  ```
- [ ] Review error logs
  ```bash
  docker compose -f docker-compose.prod.yml logs --tail=100 app | grep -i error
  ```

**Weekly:**
- [ ] Check disk space
  ```bash
  docker system df
  ```
- [ ] Review ModSecurity blocks
  ```bash
  docker compose -f docker-compose.prod.yml exec nginx grep -c "ModSecurity: Access denied" /var/log/modsec/audit.log
  ```
- [ ] Verify SSL certificate validity
  ```bash
  docker compose -f docker-compose.prod.yml run --rm certbot certificates
  ```

**Monthly:**
- [ ] Update base images
  ```bash
  docker compose -f docker-compose.prod.yml pull
  docker compose -f docker-compose.prod.yml up -d
  ```
- [ ] Clean old Docker data
  ```bash
  docker system prune -a --volumes
  ```
- [ ] Review and update ModSecurity rules
- [ ] Test backup restoration

### 12.2 Common Operations

**View Logs:**
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f app

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 nginx
```

**Restart Services:**
```bash
# Restart all
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart app
```

**Update Application Code:**
```bash
# Pull latest code
git pull

# Rebuild and restart app container
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d app
```

**Database Operations:**
```bash
# Access MongoDB shell
docker compose -f docker-compose.prod.yml exec mongodb mongosh

# Create manual backup
docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh

# Restore from backup
docker compose -f docker-compose.prod.yml exec mongodb \
  mongorestore --drop /backups/backup_20260212_030000/mongo
```

**Scale Services (if needed):**
```bash
# Not typically needed for this app, but possible:
docker compose -f docker-compose.prod.yml up -d --scale app=2
```

**Monitor Resources:**
```bash
# Real-time stats
docker stats

# Disk usage by container
docker system df -v
```

### 12.3 Troubleshooting

**Container Won't Start:**
```bash
# Check logs for error
docker compose -f docker-compose.prod.yml logs app

# Check resource limits
docker inspect tournament-app-prod | grep -i memory
df -h  # Check disk space
```

**502 Bad Gateway:**
```bash
# Check if app container is running
docker compose -f docker-compose.prod.yml ps app

# Check app health
docker compose -f docker-compose.prod.yml exec app curl localhost:3000/health

# Check Nginx upstream config
docker compose -f docker-compose.prod.yml exec nginx nginx -T | grep upstream
```

**WebSocket Not Connecting:**
```bash
# Check Nginx WebSocket upgrade headers
docker compose -f docker-compose.prod.yml logs nginx | grep Upgrade

# Test WebSocket from server
wscat -c wss://budescharfeseck.de/socket.io/?EIO=4&transport=websocket
```

**ModSecurity False Positives:**
```bash
# Check blocked requests
docker compose -f docker-compose.prod.yml exec nginx tail -100 /var/log/modsec/audit.log

# Whitelist specific rule (add to custom-rules.conf)
SecRuleRemoveById 920100

# Reload Nginx
docker compose -f docker-compose.prod.yml restart nginx
```

### 12.4 Monitoring Setup (Optional but Recommended)

**Prometheus + Grafana:**
- Monitor container metrics
- Alert on high CPU/memory usage
- Track request rates and errors

**Uptime Monitoring:**
- Use external service (UptimeRobot, StatusCake)
- Monitor https://budescharfeseck.de/health
- Alert on downtime

**Log Aggregation:**
- ELK Stack or Loki
- Centralized log search
- Long-term log retention

---

## 13. Success Criteria

Migration is successful when:

- [ ] All services running and healthy
- [ ] Application accessible via HTTPS
- [ ] SSL certificate valid (Let's Encrypt)
- [ ] WebSocket connections work (live game)
- [ ] File uploads work
- [ ] Database operations work
- [ ] ModSecurity blocking attacks (tested)
- [ ] Backups running automatically
- [ ] No errors in logs for 24 hours
- [ ] Performance equal or better than before
- [ ] Auto-restart on server reboot works

---

## 14. Timeline Estimate

| Phase | Duration | Can be done in parallel? |
|-------|----------|-------------------------|
| Preparation | 2-4 hours | No |
| Configuration Files | 3-5 hours | No |
| Code Modifications | 1-2 hours | No |
| Local Testing | 2-4 hours | No |
| Production Deployment | 30-60 min | No (downtime) |
| Post-Migration Monitoring | 24 hours | Yes (background) |
| **Total (excluding monitoring)** | **8.5-15.5 hours** | |
| **Actual downtime** | **30-60 minutes** | |

---

## 15. Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| SSL certificate fails | High | Low | Test certificate acquisition in staging; have manual process ready |
| WebSocket issues through Nginx | High | Medium | Thorough testing; fallback to polling transport |
| ModSecurity blocks legitimate traffic | Medium | Medium | Start with low paranoia level; monitor and tune rules |
| Data migration fails | High | Low | Complete backup before migration; test restore process |
| Performance degradation | Medium | Low | Load testing before production; monitor metrics |
| Container orchestration complexity | Low | Medium | Extensive documentation; training |

---

## 16. Contacts and Resources

**Key Documentation:**
- Docker: https://docs.docker.com
- Docker Compose: https://docs.docker.com/compose
- Nginx: https://nginx.org/en/docs
- ModSecurity: https://github.com/SpiderLabs/ModSecurity
- OWASP CRS: https://coreruleset.org
- Let's Encrypt: https://letsencrypt.org/docs

**Support:**
- Docker Community: https://forums.docker.com
- Nginx Community: https://forum.nginx.org
- Stack Overflow: `[docker] [nginx] [modsecurity]`

---

## Appendix A: Directory Structure After Migration

```
Tournament-Planner/
├── docker/
│   ├── nginx/
│   │   ├── conf/
│   │   │   ├── nginx.conf
│   │   │   └── default.conf
│   │   └── modsecurity/
│   │       ├── modsecurity.conf
│   │       └── custom-rules.conf
│   ├── app/
│   │   └── Dockerfile
│   ├── backup/
│   │   ├── Dockerfile
│   │   └── scripts/
│   │       ├── backup.py
│   │       ├── backup.sh
│   │       └── crontab
│   └── secrets/
│       ├── jwt_secret.txt
│       └── mail_password.txt
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env
├── .dockerignore
├── [existing application files...]
└── DOCKER_MIGRATION_PLAN.md (this file)
```

---

## Appendix B: Quick Reference Commands

```bash
# Start services
docker compose -f docker-compose.prod.yml up -d

# Stop services
docker compose -f docker-compose.prod.yml down

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart service
docker compose -f docker-compose.prod.yml restart app

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build app

# Check status
docker compose -f docker-compose.prod.yml ps

# Execute command in container
docker compose -f docker-compose.prod.yml exec app sh

# View resource usage
docker stats

# Clean system
docker system prune -a

# Backup database
docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh

# Renew SSL
docker compose -f docker-compose.prod.yml run --rm certbot renew
```

---

**End of Migration Plan**

*Version: 1.0*  
*Date: 2026-02-12*  
*Author: Software Architect*
