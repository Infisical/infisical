# Dynamic Secrets: SQL Databases

## PostgreSQL

### Prerequisites
- A PostgreSQL user with permissions to CREATE ROLE, GRANT, and REVOKE
- This user will be used by Infisical to create/drop temporary database users

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration (e.g., `1h`) |
| Max TTL | Yes | Maximum lease duration (e.g., `24h`) |
| Host | Yes | Database hostname or IP |
| Port | Yes | Database port (default: `5432`) |
| User | Yes | Admin user for creating credentials |
| Password | Yes | Admin user password |
| Database Name | Yes | Target database |
| CA (SSL) | No | CA certificate for SSL connections (common for AWS RDS) |

### SQL Statements (Customizable)
Default creation statement grants broad access. **Customize for least privilege:**

```sql
-- Example: Read-only access to specific tables
CREATE ROLE "{{username}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';
GRANT SELECT ON TABLE public.users, public.orders TO "{{username}}";
```

**Template variables:** `{{username}}`, `{{password}}`, `{{expiration}}`

**Note:** PostgreSQL uses double quotes for identifiers.

### Lease Returns
- `DB_USERNAME` — Generated username
- `DB_PASSWORD` — Generated password

---

## MySQL

### Prerequisites
- A MySQL user with CREATE USER, GRANT, and REVOKE privileges
- This user will be used by Infisical to create/drop temporary database users

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration |
| Max TTL | Yes | Maximum lease duration |
| Host | Yes | Database hostname or IP |
| Port | Yes | Database port (default: `3306`) |
| User | Yes | Admin user for creating credentials |
| Password | Yes | Admin user password |
| Database Name | Yes | Target database |
| CA (SSL) | No | CA certificate for SSL connections |

### SQL Statements (Customizable)
```sql
-- Example: Read-only access to specific database
CREATE USER '{{username}}'@'%' IDENTIFIED BY '{{password}}';
GRANT SELECT ON mydb.* TO '{{username}}'@'%';
```

**Template variables:** `{{username}}`, `{{password}}`, `{{expiration}}`

### Lease Returns
- `DB_USERNAME` — Generated username
- `DB_PASSWORD` — Generated password

---

## Cassandra

### Prerequisites
- A Cassandra user with privileges to create, drop, and grant roles
- `cassandra.yaml` must have:
  ```yaml
  authenticator: PasswordAuthenticator
  authorizer: CassandraAuthorizer
  ```

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default lease duration |
| Max TTL | Yes | Maximum lease duration |
| Host | Yes | Cassandra host(s) — comma-separated for multiple nodes |
| Port | Yes | Cassandra port (default: `9042`) |
| User | Yes | Admin user for creating credentials |
| Password | Yes | Admin user password |
| Local Data Center | Yes | Must match cluster data center name |
| Keyspace | No | Restrict user to specific keyspace |
| CA (SSL) | No | CA certificate for SSL connections |

### CQL Statements (Customizable)
```cql
-- Example: Read-only access to specific keyspace
CREATE ROLE '{{username}}' WITH PASSWORD = '{{password}}' AND LOGIN = true;
GRANT SELECT ON KEYSPACE mykeyspace TO '{{username}}';
```

### Lease Returns
- `DB_USERNAME` — Generated username
- `DB_PASSWORD` — Generated password

### Gotchas
- `PasswordAuthenticator` and `CassandraAuthorizer` MUST be set in cassandra.yaml
- `Local Data Center` must exactly match your cluster's DC name

---

## Other SQL Databases

MSSQL, Oracle, SAP ASE, SAP HANA, Snowflake, Vertica, ClickHouse, and Azure SQL Database all follow the same pattern:

1. Provide connection details (host, port, admin user/password, database)
2. Optionally customize SQL creation/revocation statements
3. Generate leases that return `DB_USERNAME` and `DB_PASSWORD`

Key differences:
- **MSSQL:** Uses `CREATE LOGIN` / `CREATE USER` syntax
- **Oracle:** Uses `CREATE USER` / `GRANT CONNECT` syntax
- **Snowflake:** Requires warehouse, account identifier, and organization name
- **Azure SQL Database:** Similar to MSSQL but requires Azure-specific connection strings

### Username Template

All SQL providers support an optional **Username Template** field that lets you customize the format of generated usernames (e.g., adding a prefix like `inf_{{random}}`).
