# Dynamic Secrets Overview

## What are Dynamic Secrets?

Dynamic secrets are credentials generated on-demand upon access rather than stored statically. Each credential is:

- **Unique** to the identity requesting it
- **Short-lived** with a configurable TTL
- **Automatically revocable** when the lease expires
- **Auditable** with full traceability of who accessed what and when

## Core Concepts

### Lease Lifecycle

1. **Generate** — User or application requests a new lease with a specific TTL
2. **Use** — Credentials are active until the lease expires
3. **Renew** — Extend the lease TTL (cannot exceed the Max TTL defined on the dynamic secret)
4. **Revoke** — Manually delete the lease before TTL expiration, or let it auto-expire

### TTL Settings

Every dynamic secret has two TTL settings:

- **Default TTL** — The default duration when generating a new lease (e.g., `1h`, `30m`)
- **Max TTL** — The absolute ceiling — leases cannot be renewed past this point (e.g., `24h`, `7d`)

### Supported Providers (27)

**SQL Databases:** PostgreSQL, MySQL, MSSQL, Oracle, SAP ASE, SAP HANA, Snowflake, Vertica, ClickHouse, Azure SQL Database

**NoSQL & Cache:** Redis, MongoDB, MongoDB Atlas, Elasticsearch, Couchbase, Cassandra, RabbitMQ

**Cloud IAM:** AWS IAM (users + temporary credentials), GCP IAM (service account tokens), Azure Entra ID

**Infrastructure:** SSH Certificates, Kubernetes Service Account Tokens, LDAP, GitHub (tokens), TOTP

## Common Setup Pattern

1. **Open Secret Overview Dashboard** → Select environment
2. **Click "Add Dynamic Secret"**
3. **Select provider** (e.g., SQL Database, Redis, AWS IAM, SSH)
4. **Configure:**
   - Secret Name
   - Default TTL and Max TTL
   - Provider-specific connection details (host, port, credentials)
   - Optional: Custom creation/revocation statements
   - Optional: Gateway for private network access
5. **Submit** — Dynamic secret appears in dashboard
6. **Generate Lease** — Click the dynamic secret → "New Lease" → specify TTL

## Gateway for Private Networks

If your database or resource is in a VPC, private subnet, or behind a firewall with no public endpoint, you need an **Infisical Gateway**.

- Gateway is a lightweight service deployed in your private network
- It makes only outbound connections (no inbound firewall rules needed)
- Routes traffic through a relay server using SSH reverse tunnels
- **Enterprise feature** (Cloud Enterprise tier or self-hosted Enterprise license)
- One gateway per network/region/isolated environment

Configure the gateway when creating the dynamic secret — select it from the Gateway dropdown.

## Using Dynamic Secrets Programmatically

### Via Infisical Agent Templates

```go
{{ with dynamicSecret "my-project" "dev" "/" "postgres-creds" "1h" }}
DB_USER={{ .DB_USERNAME }}
DB_PASS={{ .DB_PASSWORD }}
{{ end }}
```

The agent automatically renews leases before expiration.

### Via API

Use the Infisical API to create, renew, and revoke leases programmatically. Authenticate with a machine identity access token.

### Via SDKs

Infisical SDKs support dynamic secret lease creation. Check the SDK docs for your language.
