# Self-Hosting Infisical with Docker: A Quick Start Guide

## Overview

Infisical is an open-source secret management platform that you can self-host using Docker. For a small team, the **simplest approach is Docker Compose**, which bundles Infisical with PostgreSQL and Redis in a single, easy-to-manage setup.

## Deployment Options Comparison

Infisical offers three main self-hosting paths:

| Option | Complexity | Best For | High Availability |
|--------|-----------|----------|-------------------|
| **Docker Compose** | Simple | Small teams, PoCs, development | No |
| **Docker** | Moderate | Custom setups (BYOD: Bring Your Own DB/Redis) | Optional |
| **Kubernetes/Helm** | Complex | Large deployments, multi-region | Yes |

**For your small team**, Docker Compose is the clear winner—it's production-ready for small-scale deployments and requires minimal configuration.

---

## The Simplest Way: Docker Compose Setup

### Prerequisites

1. **Docker Engine** (version 20.10+)
2. **Docker Compose** (version 2.0+)
3. **A Linux server** (Ubuntu 20.04+ recommended) or Docker Desktop on macOS/Windows
4. **4 GB RAM minimum** (8 GB recommended)
5. **20 GB disk space** (50 GB+ recommended for growth)

### Verify Prerequisites

```bash
docker --version
docker compose version
```

---

## Step-by-Step Installation

### Step 1: Create a Project Directory

```bash
mkdir infisical-deployment
cd infisical-deployment
```

### Step 2: Download the Docker Compose File

```bash
curl -o docker-compose.prod.yml https://raw.githubusercontent.com/Infisical/infisical/main/docker-compose.prod.yml
```

This file defines three services:
- **backend**: The main Infisical application (exposed on port 80)
- **db**: PostgreSQL 14 for persistent data
- **redis**: Redis for caching and job queues

### Step 3: Download and Configure Environment Variables

```bash
curl -o .env https://raw.githubusercontent.com/Infisical/infisical/main/.env.example
```

**Protect your `.env` file** (contains secrets):

```bash
chmod 600 .env
```

**Edit `.env` and configure:**

```env
# Essential settings (required)
ENCRYPTION_KEY=f13dbc92aaaf86fa7cb0ed8ac3265f47
AUTH_SECRET=5lrMXKKWCVocS/uerPsl7V+TX/aaUaI7iDkgl3tSmLE=
SITE_URL=http://localhost:80

# Database (default values work fine for local setup)
POSTGRES_USER=infisical
POSTGRES_PASSWORD=infisical
DB_CONNECTION_URI=postgres://infisical:infisical@db:5432/infisical

# Redis (default works fine)
REDIS_URL=redis://redis:6379

# Optional: Email/SMTP for user invitations and password resets
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USERNAME=your-email@gmail.com
# SMTP_PASSWORD=your-app-password
# SMTP_FROM_ADDRESS=your-email@gmail.com
# SMTP_FROM_NAME=Infisical
```

**Important security notes:**
- Replace `ENCRYPTION_KEY` and `AUTH_SECRET` with production-grade values (see "Security Considerations" below)
- Never commit `.env` to version control
- Change `POSTGRES_PASSWORD` to a strong password
- Update `SITE_URL` if accessing from a domain or public IP

### Step 4: Start Infisical

```bash
docker compose -f docker-compose.prod.yml up -d
```

This command:
- Creates three containers
- Initializes the PostgreSQL database
- Starts Redis for caching
- Launches the Infisical backend

### Step 5: Verify Deployment

Check all services are running:

```bash
docker compose -f docker-compose.prod.yml ps
```

Expected output:
```
NAME                 STATUS
infisical-backend    Up (healthy)
infisical-db         Up (healthy)
infisical-dev-redis  Up
```

Test the API:

```bash
curl -s http://localhost:80/api/status | head -c 100
```

### Step 6: Create Your Admin Account

1. Open your browser and navigate to `http://localhost:80` (or your configured domain)
2. The first user to sign up becomes the instance administrator
3. Create your admin account with a strong password
4. Log in and start creating projects

---

## Key Configuration Points

### ENCRYPTION_KEY and AUTH_SECRET

These are critical for security. Generate strong values:

```bash
# Generate ENCRYPTION_KEY (32 hex characters)
openssl rand -hex 16

# Generate AUTH_SECRET (base64)
openssl rand -base64 32
```

Replace the sample values in your `.env` with these generated keys.

### SITE_URL

Set this to how users will access Infisical:
- Local development: `http://localhost:80`
- Private network: `http://192.168.1.100:80`
- Domain: `https://secrets.example.com` (requires HTTPS setup)

### Email/SMTP Configuration

If you want user invitations and password resets to work:

**Gmail Example:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_ADDRESS=your-email@gmail.com
SMTP_FROM_NAME=Infisical
```

Note: Use an [App Password](https://support.google.com/accounts/answer/185833) for Gmail, not your regular password.

After updating, restart:
```bash
docker compose -f docker-compose.prod.yml restart backend
```

---

## Managing Your Deployment

### Stop Services

```bash
docker compose -f docker-compose.prod.yml down
```

### Restart Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

### View Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f db
```

### Backup Your Database

Your secrets are stored in PostgreSQL. **Always back up before maintenance:**

```bash
docker compose -f docker-compose.prod.yml exec db pg_dump -U infisical infisical > backup_$(date +%Y%m%d_%H%M%S).sql
```

Restore from backup:

```bash
docker compose -f docker-compose.prod.yml exec -T db psql -U infisical infisical < backup.sql
```

**Critical:** Also backup your `ENCRYPTION_KEY` from `.env`. Without it, you cannot decrypt secrets even if you restore the database.

---

## Enabling HTTPS

For production deployments, always use HTTPS. Here's the quickest approach using Let's Encrypt:

### 1. Obtain SSL Certificates

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d secrets.example.com
```

### 2. Create NGINX Reverse Proxy

Add this to your `docker-compose.prod.yml`:

```yaml
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - backend
```

### 3. Create `./nginx/nginx.conf`

```nginx
events {}

http {
  server {
    listen 80;
    server_name secrets.example.com;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl;
    server_name secrets.example.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
      proxy_pass http://backend:8080;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
}
```

### 4. Copy Certificates

```bash
mkdir -p ./nginx/certs
sudo cp /etc/letsencrypt/live/secrets.example.com/fullchain.pem ./nginx/certs/
sudo cp /etc/letsencrypt/live/secrets.example.com/privkey.pem ./nginx/certs/
```

### 5. Update Configuration and Restart

```bash
# Update .env
SITE_URL=https://secrets.example.com

# Restart services
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## Security Considerations

### Critical Security Steps

1. **Generate Strong Keys**: Never use sample values from `.env.example` in production
   ```bash
   openssl rand -hex 16  # For ENCRYPTION_KEY
   openssl rand -base64 32  # For AUTH_SECRET
   ```

2. **Protect Your `.env` File**
   ```bash
   chmod 600 .env
   ```

3. **Don't Commit Secrets to Git**
   ```bash
   echo ".env" >> .gitignore
   ```

4. **Change Default Database Password**
   Update `POSTGRES_PASSWORD` to a strong value

5. **Firewall Configuration**
   - Allow ports 80/443 for public access
   - Block ports 5432 (PostgreSQL) and 6379 (Redis) from internet

   Ubuntu/Debian (UFW):
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw deny 5432/tcp
   sudo ufw deny 6379/tcp
   sudo ufw enable
   ```

### Data Persistence

The Docker Compose setup uses named volumes:

| Volume | Purpose | Data |
|--------|---------|------|
| `pg_data` | PostgreSQL | All secrets, users, projects (encrypted) |
| `redis_data` | Redis | Cache and job queues (regenerable) |

**Warning:** Never delete the `pg_data` volume—it contains your encrypted secrets. Always back up before maintenance.

---

## Scaling Beyond Small Teams

If your team grows, consider:

### 1. Use Managed Databases

Replace containerized PostgreSQL/Redis with managed services (AWS RDS, GCP Cloud SQL, etc.):

```env
DB_CONNECTION_URI=postgresql://<user>:<password>@<managed-host>:5432/<dbname>
REDIS_URL=redis://:<password>@<managed-host>:6379
```

Remove `db` and `redis` services from `docker-compose.prod.yml`.

### 2. Upgrade to Kubernetes

For high availability and auto-scaling:
- See `/self-hosting/deployment-options/kubernetes-helm` in the documentation
- Provides features like:
  - Auto-scaling
  - Multi-replica deployments
  - Better resource management
  - Rolling updates

---

## Troubleshooting

### Containers Won't Start

```bash
# Check container status
docker compose -f docker-compose.prod.yml ps -a

# View startup errors
docker compose -f docker-compose.prod.yml logs
```

**Common causes:**
- Port 80 already in use: Change port mapping or stop conflicting service
- Insufficient memory: Ensure 4GB+ free RAM
- Invalid `.env`: Check for syntax errors or missing variables

### Cannot Access Infisical in Browser

```bash
# Test API endpoint
curl -v http://localhost:80/api/status

# Check if port is listening
sudo netstat -tlnp | grep :80
# or
sudo ss -tlnp | grep :80

# Check firewall
sudo ufw status
```

### Database Connection Errors

```bash
# Check if PostgreSQL is running
docker compose -f docker-compose.prod.yml exec db pg_isready

# Test database connection
docker compose -f docker-compose.prod.yml exec db psql -U infisical -c "SELECT 1"

# View backend logs
docker compose -f docker-compose.prod.yml logs backend | grep -i "database\|postgres"
```

### Email Not Working

```bash
# Test SMTP connectivity
docker compose -f docker-compose.prod.yml exec backend nc -zv smtp.gmail.com 587

# Check logs
docker compose -f docker-compose.prod.yml logs backend | grep -i "smtp\|email"
```

---

## Keeping Infisical Updated

New versions include security patches and features:

### 1. Back Up Your Database

```bash
docker compose -f docker-compose.prod.yml exec db pg_dump -U infisical infisical > backup_before_upgrade.sql
```

### 2. Update the Image Tag

Edit `docker-compose.prod.yml` and change:
```yaml
image: infisical/infisical:latest  # Use specific version
```
to:
```yaml
image: infisical/infisical:0.X.X  # Pin to a specific version
```

### 3. Pull and Restart

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### 4. Verify the Upgrade

```bash
docker compose -f docker-compose.prod.yml logs -f backend
```

Watch for successful database migration messages.

---

## Resource Summary

### Files You'll Need

1. **docker-compose.prod.yml** — Service definitions (downloaded)
2. **.env** — Configuration and secrets (downloaded and customized)
3. **nginx/nginx.conf** — HTTPS proxy (create if using TLS)

### Essential Ports

| Port | Service | Access |
|------|---------|--------|
| 80 | HTTP | Public/internal |
| 443 | HTTPS | Public/internal (if TLS enabled) |
| 5432 | PostgreSQL | Container-only |
| 6379 | Redis | Container-only |

### Repository References

- **Main docker-compose file**: `/docker-compose.prod.yml`
- **Standalone Dockerfile**: `/Dockerfile.standalone-infisical`
- **Full documentation**: `/docs/self-hosting/`
- **Configuration reference**: `/docs/self-hosting/configuration/envars`

---

## What's Next?

Once Infisical is running:

1. **Create Projects**: Organize your secrets by project (e.g., staging, production)
2. **Manage Team Members**: Invite team members and set permissions
3. **Configure Integrations**: Connect to your apps via API or CLI
4. **Set Up Backup Strategy**: Schedule automated database backups
5. **Monitor Logs**: Set up centralized logging (optional)
6. **Plan Scaling**: Evaluate if managed databases are needed for team growth

---

## Summary

For a small team, self-hosting Infisical with Docker Compose is:
- **Simple**: ~5 minutes to get running
- **Secure**: All data encrypted and stays on your infrastructure
- **Cost-effective**: Minimal resource requirements
- **Scalable**: Upgrade to managed databases or Kubernetes as you grow

The setup uses containerized PostgreSQL and Redis, making it production-ready without the complexity of Kubernetes. Start here, and graduate to more complex deployments only when you need high availability or auto-scaling.
