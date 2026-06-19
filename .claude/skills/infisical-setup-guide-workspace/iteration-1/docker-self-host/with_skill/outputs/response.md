# Self-Hosting Infisical with Docker — Simplest Setup Guide

For a small team, the simplest way to self-host Infisical is **Docker Compose**. It bundles everything you need (backend, PostgreSQL, and Redis) in a single compose file — no separate database infrastructure required.

## Why Docker Compose for a small team?

- **All-in-one**: Backend, database, and caching layer work out of the box
- **Fast setup**: Get running in minutes, not hours
- **Easy upgrades**: Pull the latest image and restart
- **Minimal overhead**: Ideal for 5-50 person teams
- **No external dependencies**: No need for AWS RDS, managed Redis, or Kubernetes

---

## Quick Start (5-10 minutes)

### Step 1: Get the compose file

If you have the Infisical repo cloned, the file is already there:

```bash
cat docker-compose.prod.yml
```

Otherwise, download it:

```bash
curl -o docker-compose.prod.yml https://raw.githubusercontent.com/Infisical/infisical/main/docker-compose.prod.yml
```

### Step 2: Set up environment variables

Download the template:

```bash
curl -o .env https://raw.githubusercontent.com/Infisical/infisical/main/.env.example
```

Edit `.env` and set these **required** variables. Here's what you need to generate:

**ENCRYPTION_KEY** — Run this in your terminal (not in this chat):
```bash
openssl rand -hex 16
```
Copy the output (a 32-character hex string) into `.env` as `ENCRYPTION_KEY=<paste-here>`

**AUTH_SECRET** — Run this in your terminal:
```bash
openssl rand -base64 32
```
Copy the output into `.env` as `AUTH_SECRET=<paste-here>`

**Other required variables** — Edit these in `.env`:

```bash
# Database password (choose something strong)
POSTGRES_PASSWORD=your_strong_postgres_password

# Database connection string (must match POSTGRES_PASSWORD)
DB_CONNECTION_URI=postgres://infisical:your_strong_postgres_password@db:5432/infisical

# Redis URL (keep default for bundled Redis)
REDIS_URL=redis://redis:6379

# Public URL where your team accesses Infisical
SITE_URL=https://your-domain.com
```

**Important security notes:**
- Generate `ENCRYPTION_KEY` and `AUTH_SECRET` in your own terminal — do not ask an AI or use an online tool
- Save `ENCRYPTION_KEY` somewhere safe (e.g., password manager) — you'll need it if you ever need to migrate data
- Never commit `.env` to version control — add it to `.gitignore`

### Step 3: Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

This starts three containers:
- **Backend** (port 80) — the Infisical web app and API
- **PostgreSQL** — stores encrypted secrets and user data
- **Redis** — caching and job queues

### Step 4: Verify it's working

```bash
docker compose -f docker-compose.prod.yml ps
```

You should see three containers running: `infisical-backend`, `infisical-db`, and `infisical-redis`.

Check the health endpoint:

```bash
curl http://localhost/api/status
```

Open your browser to `http://localhost` (or your `SITE_URL`). You'll see a sign-up page to create your first admin account.

---

## What to do next

### Enable HTTPS (production essential)

For a real deployment, you **must** use HTTPS. Options:

1. **Nginx reverse proxy** with Let's Encrypt (free SSL certificates)
   - Run Nginx in front of Infisical on port 443
   - Redirect HTTP → HTTPS
   - Docs: https://docs.infisical.com/self-hosting/guides/nginx-reverse-proxy

2. **Cloud load balancer** (if on AWS, GCP, Azure)
   - Put your Docker stack behind a managed load balancer with SSL termination

### Enable email (invitations & password resets)

Add these to `.env` to allow team members to receive invitations:

```bash
SMTP_HOST=your-smtp-host.com
SMTP_PORT=587
SMTP_USERNAME=your-email@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_ADDRESS=noreply@your-domain.com
SMTP_FROM_NAME=Infisical
```

### Set up backups

Before anything goes to production, set up automated backups of your PostgreSQL database:

```bash
# Manual backup
docker exec infisical-db pg_dump -U infisical infisical > backup.sql

# Restore from backup
cat backup.sql | docker exec -i infisical-db psql -U infisical infisical
```

For production, set up automated backups (daily to cloud storage — S3, GCS, or similar).

### Configure authentication for your team

Once Infisical is running, set up one of these for your team:

- **Email/password** (default) — manual user invitations through the UI
- **SAML 2.0** — connect to your company directory (Okta, Azure AD, Google Workspace)
- **OIDC** — for modern identity providers
- **LDAP** — for on-premises Active Directory

See the [auth methods guide](../references/auth-methods.md) for details on each.

### Set up machine identities for CI/CD

Once your team is using Infisical, connect your CI/CD pipelines (GitHub Actions, GitLab CI, etc.) so they can fetch secrets:

- **Universal Auth** — simple client ID + secret
- **OIDC Auth** — GitHub Actions, GitLab CI, or any OIDC provider
- **AWS Auth** — if running on EC2, ECS, or Lambda
- **Kubernetes Auth** — if using K8s

See the [machine identities guide](../references/machine-identities.md) for setup.

---

## Upgrading later

When Infisical releases updates, upgrading is easy:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The backend runs database migrations automatically — zero downtime.

---

## Common issues & troubleshooting

### Infisical won't start (backend container keeps restarting)

Check the logs:

```bash
docker compose -f docker-compose.prod.yml logs backend
```

Most common causes:
- Missing or invalid `ENCRYPTION_KEY` (must be 32-char hex)
- `DB_CONNECTION_URI` doesn't match your `POSTGRES_PASSWORD`
- Database isn't ready yet (wait 30 seconds and try again)

### Forgot ENCRYPTION_KEY

If you lost it, you cannot decrypt your secrets without the original key. Always keep a backup of `ENCRYPTION_KEY` in a secure location (password manager, encrypted drive, etc.).

### PostgreSQL volume full

If you run out of disk space:

```bash
docker system prune  # Remove unused images/containers
docker exec infisical-db du -sh /var/lib/postgresql/data
```

For a small team, 20-50GB disk is typically enough.

### Can't reach Infisical from outside

Make sure:
1. `SITE_URL` in `.env` matches your actual domain
2. Firewall allows ports 80 and 443
3. If using HTTPS, your SSL certificate is valid
4. DNS is pointing to your server's IP

---

## Architecture diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Your Server (Docker host)                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Docker Compose Network (infisical)                     │ │
│  │                                                        │ │
│  │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │ │ Backend      │  │ PostgreSQL   │  │ Redis        │ │ │
│  │ │ Port 80      │  │ Persistent   │  │ Caching &    │ │ │
│  │ │ :8080        │  │ Volume       │  │ Job queues   │ │ │
│  │ │              │  │              │  │              │ │ │
│  │ │ • API        │  │ • Secrets    │  │ • Sessions   │ │ │
│  │ │ • Frontend   │  │ • Users      │  │ • Pending    │ │ │
│  │ │   (React)    │  │ • Projects   │  │   jobs       │ │ │
│  │ └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  │         ↑                ↑                  ↑         │ │
│  │         └────────────────┼──────────────────┘         │ │
│  │                  (connected via Docker network)       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  Volumes:                                                   │
│  • pg_data → /var/lib/postgresql/data                       │
│  • redis_data → /data                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Key files in the repo

- **`docker-compose.prod.yml`** — production compose file with all three services
- **`.env.example`** — template for environment variables
- **`docs/self-hosting/`** — full self-hosting documentation
- **`docs/self-hosting/configuration/envars.mdx`** — complete env var reference
- **`Dockerfile.standalone-infisical`** — if you ever want to use the standalone image instead

---

## Next steps

1. **Generate your secrets** (ENCRYPTION_KEY, AUTH_SECRET) in your own terminal
2. **Edit `.env`** with your settings
3. **Run `docker compose up -d`**
4. **Create your first admin account** at `http://localhost`
5. **Invite your team** via email
6. **Set up HTTPS** (essential for production)
7. **Configure authentication** (SAML, OIDC, or keep email/password)
8. **Set up backups** before storing any production secrets

That's it! You now have a self-hosted secret management platform for your team.

For more details on auth, machine identities, or advanced configurations, see the other guides in this skill.
