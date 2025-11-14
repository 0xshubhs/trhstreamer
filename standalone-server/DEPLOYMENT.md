# Deployment Guide

## Table of Contents

1. [VPS/Cloud Deployment](#vpscloud-deployment)
2. [Docker Deployment](#docker-deployment)
3. [Kubernetes Deployment](#kubernetes-deployment)
4. [Nginx Reverse Proxy](#nginx-reverse-proxy)
5. [SSL/TLS Setup](#ssltls-setup)
6. [Process Management](#process-management)

---

## VPS/Cloud Deployment

### Prerequisites
- Ubuntu 22.04+ or similar Linux distribution
- Node.js 20+ installed
- Domain name pointed to your server
- Firewall configured to allow ports 80 and 443

### Step 1: Setup Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install nginx
sudo apt install -y nginx

# Install certbot for SSL
sudo apt install -y certbot python3-certbot-nginx
```

### Step 2: Deploy Application

```bash
# Clone your repository (or upload files)
git clone your-repo-url /var/www/streaming-server
cd /var/www/streaming-server/standalone-server

# Install dependencies
pnpm install --frozen-lockfile

# Build application
pnpm build

# Create environment file
sudo nano /var/www/streaming-server/standalone-server/.env
```

Add to `.env`:
```env
PORT=8080
RELAY_API_KEY=your-very-secure-random-key-here
FETCH_TIMEOUT_MS=15000
NODE_ENV=production
```

### Step 3: Create systemd Service

```bash
sudo nano /etc/systemd/system/streaming-server.service
```

Add:
```ini
[Unit]
Description=Streaming Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/streaming-server/standalone-server
Environment="NODE_ENV=production"
EnvironmentFile=/var/www/streaming-server/standalone-server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable streaming-server
sudo systemctl start streaming-server
sudo systemctl status streaming-server
```

---

## Docker Deployment

### Simple Docker Run

```bash
# Build image
docker build -t streaming-server .

# Run container
docker run -d \
  --name streaming-server \
  -p 8080:8080 \
  -e RELAY_API_KEY=your-secret-key \
  -e PORT=8080 \
  --restart unless-stopped \
  streaming-server

# Check logs
docker logs -f streaming-server
```

### Docker Compose (Recommended)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  streaming-server:
    build: .
    container_name: streaming-server
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - PORT=8080
      - RELAY_API_KEY=${RELAY_API_KEY}
    restart: unless-stopped
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:8080/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Deploy:
```bash
export RELAY_API_KEY=your-secret-key
docker-compose up -d
```

---

## Kubernetes Deployment

### Create Kubernetes Manifests

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: streaming-server
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: streaming-server
  template:
    metadata:
      labels:
        app: streaming-server
    spec:
      containers:
      - name: streaming-server
        image: your-registry/streaming-server:latest
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: NODE_ENV
          value: "production"
        - name: RELAY_API_KEY
          valueFrom:
            secretKeyRef:
              name: streaming-secrets
              key: api-key
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

**service.yaml:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: streaming-server
spec:
  selector:
    app: streaming-server
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: LoadBalancer
```

**secret.yaml:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: streaming-secrets
type: Opaque
stringData:
  api-key: your-secret-api-key-here
```

Deploy:
```bash
kubectl apply -f secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

---

## Nginx Reverse Proxy

### Configuration for HTTP

```bash
sudo nano /etc/nginx/sites-available/streaming-server
```

Add:
```nginx
server {
    listen 80;
    server_name stream.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for streaming
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/streaming-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## SSL/TLS Setup

### Using Certbot (Let's Encrypt)

```bash
# Get SSL certificate
sudo certbot --nginx -d stream.yourdomain.com

# Auto-renewal is configured automatically
# Test renewal:
sudo certbot renew --dry-run
```

Nginx will be automatically updated to:
```nginx
server {
    listen 443 ssl http2;
    server_name stream.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/stream.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stream.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # ... rest of configuration
}

server {
    listen 80;
    server_name stream.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Process Management

### Using PM2 (Alternative to systemd)

```bash
# Install PM2
npm install -g pm2

# Start application
cd /var/www/streaming-server/standalone-server
pm2 start dist/index.js --name streaming-server

# Configure auto-restart
pm2 startup
pm2 save

# Monitoring
pm2 status
pm2 logs streaming-server
pm2 monit
```

**ecosystem.config.js** for PM2:
```javascript
module.exports = {
  apps: [{
    name: 'streaming-server',
    script: './dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm Z'
  }]
};
```

Run with PM2:
```bash
pm2 start ecosystem.config.js
```

---

## Monitoring & Logging

### Setup Log Rotation

```bash
sudo nano /etc/logrotate.d/streaming-server
```

Add:
```
/var/www/streaming-server/standalone-server/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    sharedscripts
    postrotate
        systemctl reload streaming-server > /dev/null 2>&1 || true
    endscript
}
```

### Health Monitoring Script

```bash
#!/bin/bash
# /usr/local/bin/check-streaming-server.sh

HEALTH_URL="http://localhost:8080/health"
WEBHOOK_URL="your-webhook-url"  # Slack, Discord, etc.

if ! curl -s -f "$HEALTH_URL" > /dev/null; then
    echo "Streaming server is DOWN!"
    curl -X POST "$WEBHOOK_URL" -d '{"text":"🚨 Streaming server is DOWN!"}'
    sudo systemctl restart streaming-server
fi
```

Add to crontab:
```bash
*/5 * * * * /usr/local/bin/check-streaming-server.sh
```

---

## Performance Tuning

### Nginx Tuning

```nginx
# In nginx.conf
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    
    # Buffer settings
    client_body_buffer_size 10K;
    client_header_buffer_size 1k;
    client_max_body_size 50M;
    large_client_header_buffers 2 1k;
}
```

### Node.js Tuning

Set environment variables:
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
export UV_THREADPOOL_SIZE=128
```

---

## Security Hardening

1. **Firewall Rules:**
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

2. **Fail2Ban for API Protection:**
```bash
sudo apt install fail2ban
```

Create `/etc/fail2ban/filter.d/streaming-server.conf`:
```ini
[Definition]
failregex = .*Unauthorized.*<HOST>
ignoreregex =
```

3. **Rate Limiting in Nginx:**
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api/ {
    limit_req zone=api burst=20 nodelay;
    # ... rest of config
}
```

---

## Troubleshooting

### Check Service Status
```bash
sudo systemctl status streaming-server
journalctl -u streaming-server -f
```

### Check Logs
```bash
tail -f /var/www/streaming-server/standalone-server/logs/*.log
docker logs -f streaming-server  # For Docker
pm2 logs streaming-server  # For PM2
```

### Test Endpoints
```bash
curl http://localhost:8080/health
curl -H "x-api-key: your-key" http://localhost:8080/api/add-stream
```

---

## Backup & Disaster Recovery

### Automated Backups
```bash
#!/bin/bash
# /usr/local/bin/backup-streaming-server.sh

BACKUP_DIR="/backup/streaming-server"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup code
tar -czf "${BACKUP_DIR}/code_${DATE}.tar.gz" /var/www/streaming-server

# Backup .env
cp /var/www/streaming-server/standalone-server/.env "${BACKUP_DIR}/env_${DATE}.backup"

# Clean old backups (keep 7 days)
find ${BACKUP_DIR} -name "*.tar.gz" -mtime +7 -delete
```

Add to crontab:
```bash
0 2 * * * /usr/local/bin/backup-streaming-server.sh
```

---

For more information, see the main README.md
