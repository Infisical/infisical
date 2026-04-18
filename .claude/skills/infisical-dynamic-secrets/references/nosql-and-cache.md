# Dynamic Secrets: NoSQL & Cache

## Redis

### Prerequisites
- A Redis user with permissions to create ACL users (often the `default` or `admin` user)

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration |
| Max TTL | Yes | Maximum lease duration |
| Host | Yes | Redis hostname or IP address |
| Port | Yes | Redis port (default: `6379`) |
| User | Yes | Admin user (often `default` or `admin`) |
| Password | No | Required if Redis is password-protected |
| CA (SSL) | No | CA certificate (common for managed Redis like AWS ElastiCache, Azure Cache) |

### Redis ACL Statements (Customizable)
Default creates a user with broad access. Customize for least privilege:

```
-- Example: Read-only access to keys with prefix "app:"
ACL SETUSER {{username}} on >{{password}} ~app:* +get +mget +scan +keys
```

**Template variables:** `{{username}}`, `{{password}}`

### Lease Returns
- `DB_USERNAME` — Generated username
- `DB_PASSWORD` — Generated password

### Gotchas
- Requires Redis 6+ with ACL support
- Managed Redis services (ElastiCache, Azure Cache) often require SSL — use the CA field

---

## MongoDB

### Prerequisites
- A MongoDB user with `userAdmin` or `userAdminAnyDatabase` role
- **Important:** For MongoDB Atlas, use the separate **MongoDB Atlas** dynamic secret provider — standard MongoDB commands are not supported by Atlas

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration |
| Max TTL | Yes | Maximum lease duration |
| Host | Yes | MongoDB host URL |
| Port | No | Omit if using a cluster/replica set connection string |
| User | Yes | Admin user with userAdmin privileges |
| Password | Yes | Admin user password |
| Database Name | Yes | Target database for the dynamic user |
| Roles | Yes | List of MongoDB roles to assign |
| CA (SSL) | No | CA certificate for TLS connections |

### MongoDB Roles
Built-in roles include:
- `read`, `readWrite` — Database-level
- `dbAdmin`, `dbAdminAnyDatabase` — Admin
- `readAnyDatabase`, `readWriteAnyDatabase` — Cross-database
- `clusterMonitor`, `backup` — Cluster operations
- Custom role names are also supported

### Lease Returns
- `DB_USERNAME` — Generated username
- `DB_PASSWORD` — Generated password

### Gotchas
- **MongoDB vs Atlas:** Use the standard MongoDB provider for self-hosted MongoDB. Use the MongoDB Atlas provider for Atlas clusters — they use different APIs.
- Port is optional because cluster connection strings include the port

---

## Elasticsearch

### Prerequisites
- An Elasticsearch user with privileges to create/delete users and roles

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration |
| Max TTL | Yes | Maximum lease duration |
| Host | Yes | Elasticsearch host URL |
| Port | Yes | Elasticsearch port (default: `9200`) |
| User | Yes | Admin user |
| Password | Yes | Admin user password |
| Roles | Yes | Elasticsearch roles to assign |
| CA (SSL) | No | CA certificate for HTTPS connections |

### Lease Returns
- `DB_USERNAME` — Generated username
- `DB_PASSWORD` — Generated password

---

## RabbitMQ

### Prerequisites
- A RabbitMQ user with administrator tag for management API access

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration |
| Max TTL | Yes | Maximum lease duration |
| Host | Yes | RabbitMQ management API host |
| Port | Yes | Management API port (default: `15672`) |
| User | Yes | Admin user |
| Password | Yes | Admin user password |
| Virtual Host | Yes | RabbitMQ virtual host |
| Tags | No | User tags (e.g., `monitoring`, `management`) |
| Permissions | No | Configure, write, read regex patterns |

### Lease Returns
- `DB_USERNAME` — Generated username
- `DB_PASSWORD` — Generated password
