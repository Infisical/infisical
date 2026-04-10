# Infisical Python SDK Guide: Using Universal Auth

This guide covers how to use the **Infisical Python SDK** to fetch secrets in your application using **Universal Auth** for authentication.

## Installation

Install the Infisical Python SDK via pip:

```bash
pip install infisical-python
```

For the latest development version:

```bash
pip install git+https://github.com/infisical/sdk-py.git
```

## Overview of Universal Auth

Universal Auth is Infisical's machine-to-machine authentication method that uses:
- **Client ID**: A unique identifier for your application/service
- **Client Secret**: A secret key used to authenticate requests
- **Machine Identity**: The identity representing your application in Infisical

This is ideal for server-to-server communication, CI/CD pipelines, and backend services.

## Setting Up Universal Auth in Infisical

Before using the SDK, you need to create a Machine Identity in Infisical:

1. **Log in to Infisical** (self-hosted or cloud)
2. Navigate to **Organization Settings** → **Machine Identities**
3. Click **Create Machine Identity**
4. Give it a descriptive name (e.g., "my-app-backend")
5. Click **Create**
6. In the Machine Identity details, create an **Universal Auth** client:
   - Click **Add Auth Method** → **Universal Auth**
   - A **Client ID** and **Client Secret** will be generated
   - **Store these securely** (you cannot retrieve the secret again)
7. Assign the Machine Identity access to your project(s) and environment(s) with appropriate roles

## Initialization: Basic Setup

### 1. Simple Example (Recommended)

```python
from infisical_client import ClientConfig, InfisicalClient

# Initialize the client with Universal Auth
config = ClientConfig(
    api_url="https://app.infisical.com",  # Use your self-hosted URL if applicable
    client_id="YOUR_CLIENT_ID",
    client_secret="YOUR_CLIENT_SECRET",
)

client = InfisicalClient(config=config)

# Fetch a secret
secret = client.getSecret(
    secret_name="DATABASE_PASSWORD",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
)

print(secret.secret_value)
```

### 2. Using Environment Variables (Best Practice)

Store credentials as environment variables and load them:

```python
import os
from infisical_client import ClientConfig, InfisicalClient

# Load from environment variables
client_id = os.getenv("INFISICAL_CLIENT_ID")
client_secret = os.getenv("INFISICAL_CLIENT_SECRET")
api_url = os.getenv("INFISICAL_API_URL", "https://app.infisical.com")

config = ClientConfig(
    api_url=api_url,
    client_id=client_id,
    client_secret=client_secret,
)

client = InfisicalClient(config=config)

# Fetch secrets
db_password = client.getSecret(
    secret_name="DB_PASSWORD",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
).secret_value

api_key = client.getSecret(
    secret_name="API_KEY",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
).secret_value

print(f"Database Password: {db_password}")
print(f"API Key: {api_key}")
```

## Core API: Fetching Secrets

### Get a Single Secret

```python
secret = client.getSecret(
    secret_name="MY_SECRET_NAME",
    project_id="PROJECT_ID_HERE",
    environment="prod",  # or "dev", "staging", etc.
)

print(secret.secret_value)  # The actual secret value
print(secret.secret_key)    # The secret name/key
```

### Get All Secrets (in an environment)

```python
secrets = client.listSecrets(
    project_id="PROJECT_ID_HERE",
    environment="prod",
)

for secret in secrets:
    print(f"{secret.secret_key} = {secret.secret_value}")
```

### Get Secrets with Path Support

If your secrets are organized in folders/paths:

```python
secret = client.getSecret(
    secret_name="MY_SECRET_NAME",
    project_id="PROJECT_ID_HERE",
    environment="prod",
    secret_path="/path/to/secrets",  # Optional: defaults to root
)

print(secret.secret_value)
```

## Complete Application Example

Here's a real-world example of a Python Flask application using Infisical:

```python
import os
from flask import Flask
from infisical_client import ClientConfig, InfisicalClient

app = Flask(__name__)

# Initialize Infisical client once at startup
def init_infisical_client():
    config = ClientConfig(
        api_url=os.getenv("INFISICAL_API_URL", "https://app.infisical.com"),
        client_id=os.getenv("INFISICAL_CLIENT_ID"),
        client_secret=os.getenv("INFISICAL_CLIENT_SECRET"),
    )
    return InfisicalClient(config=config)

infisical_client = init_infisical_client()

# Load secrets at startup
def load_secrets():
    project_id = os.getenv("INFISICAL_PROJECT_ID")
    environment = os.getenv("INFISICAL_ENVIRONMENT", "prod")

    secrets = infisical_client.listSecrets(
        project_id=project_id,
        environment=environment,
    )

    # Build a dictionary for easy access
    secret_dict = {}
    for secret in secrets:
        secret_dict[secret.secret_key] = secret.secret_value

    return secret_dict

secrets = load_secrets()

@app.route("/api/status")
def status():
    return {"status": "ok", "app_name": secrets.get("APP_NAME", "Unknown")}

if __name__ == "__main__":
    app.run(debug=False)
```

### Environment Configuration (.env)

Create a `.env` file in your project root:

```
INFISICAL_API_URL=https://app.infisical.com
INFISICAL_CLIENT_ID=your_client_id_here
INFISICAL_CLIENT_SECRET=your_client_secret_here
INFISICAL_PROJECT_ID=your_project_id_here
INFISICAL_ENVIRONMENT=prod
```

Then load it in your application:

```python
from dotenv import load_dotenv
import os

load_dotenv()  # Load from .env file

client_id = os.getenv("INFISICAL_CLIENT_ID")
# ... rest of initialization
```

## Caching and Performance

For better performance, consider caching secrets locally:

```python
import time
from infisical_client import ClientConfig, InfisicalClient

class SecretsCache:
    def __init__(self, client, ttl_seconds=3600):
        self.client = client
        self.ttl = ttl_seconds
        self.cache = {}
        self.last_fetch = {}

    def get_secret(self, secret_name, project_id, environment, secret_path="/"):
        cache_key = f"{project_id}:{environment}:{secret_path}:{secret_name}"

        # Check if cached and not expired
        if cache_key in self.cache:
            if time.time() - self.last_fetch[cache_key] < self.ttl:
                return self.cache[cache_key]

        # Fetch fresh from Infisical
        secret = self.client.getSecret(
            secret_name=secret_name,
            project_id=project_id,
            environment=environment,
            secret_path=secret_path,
        )

        self.cache[cache_key] = secret.secret_value
        self.last_fetch[cache_key] = time.time()

        return secret.secret_value

# Usage
config = ClientConfig(
    api_url="https://app.infisical.com",
    client_id="YOUR_CLIENT_ID",
    client_secret="YOUR_CLIENT_SECRET",
)
client = InfisicalClient(config=config)
cache = SecretsCache(client, ttl_seconds=3600)

# Fetch with caching
db_password = cache.get_secret("DB_PASSWORD", "proj_123", "prod")
```

## Error Handling

Always handle errors when fetching secrets:

```python
from infisical_client import ClientConfig, InfisicalClient
from infisical_client.exceptions import InfisicalAPIException

config = ClientConfig(
    api_url="https://app.infisical.com",
    client_id="YOUR_CLIENT_ID",
    client_secret="YOUR_CLIENT_SECRET",
)
client = InfisicalClient(config=config)

try:
    secret = client.getSecret(
        secret_name="DATABASE_URL",
        project_id="proj_123",
        environment="prod",
    )
    print(f"Secret value: {secret.secret_value}")
except InfisicalAPIException as e:
    print(f"Error fetching secret: {e}")
    # Handle error appropriately (log, fallback, etc.)
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Common Use Cases

### Database Connection

```python
import psycopg2
from infisical_client import ClientConfig, InfisicalClient

config = ClientConfig(
    api_url="https://app.infisical.com",
    client_id=os.getenv("INFISICAL_CLIENT_ID"),
    client_secret=os.getenv("INFISICAL_CLIENT_SECRET"),
)
client = InfisicalClient(config=config)

# Fetch database credentials
db_host = client.getSecret(
    secret_name="DB_HOST",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
).secret_value

db_port = client.getSecret(
    secret_name="DB_PORT",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
).secret_value

db_user = client.getSecret(
    secret_name="DB_USER",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
).secret_value

db_password = client.getSecret(
    secret_name="DB_PASSWORD",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
).secret_value

# Connect to database
conn = psycopg2.connect(
    host=db_host,
    port=int(db_port),
    user=db_user,
    password=db_password,
    database="myapp"
)
```

### Third-Party API Credentials

```python
import requests
from infisical_client import ClientConfig, InfisicalClient

config = ClientConfig(
    api_url="https://app.infisical.com",
    client_id=os.getenv("INFISICAL_CLIENT_ID"),
    client_secret=os.getenv("INFISICAL_CLIENT_SECRET"),
)
client = InfisicalClient(config=config)

# Fetch API credentials
stripe_api_key = client.getSecret(
    secret_name="STRIPE_API_KEY",
    project_id="YOUR_PROJECT_ID",
    environment="prod",
).secret_value

# Use in API request
headers = {"Authorization": f"Bearer {stripe_api_key}"}
response = requests.get("https://api.stripe.com/v1/charges", headers=headers)
```

## Self-Hosted Infisical

If you're running a self-hosted instance of Infisical, adjust the `api_url`:

```python
config = ClientConfig(
    api_url="https://infisical.your-domain.com",  # Your self-hosted URL
    client_id="YOUR_CLIENT_ID",
    client_secret="YOUR_CLIENT_SECRET",
)

client = InfisicalClient(config=config)
```

## Best Practices

1. **Never hardcode credentials** — Always use environment variables or secure configuration management
2. **Use descriptive secret names** — Use uppercase with underscores (e.g., `DATABASE_URL`, `API_KEY`)
3. **Rotate secrets regularly** — Regenerate Client Secrets periodically
4. **Limit Machine Identity scope** — Only grant access to environments/projects the machine needs
5. **Monitor access logs** — Regularly audit who/what is accessing your secrets
6. **Cache when appropriate** — Reduce API calls with intelligent caching (but keep TTL reasonable)
7. **Use different Machine Identities per service** — Easier to revoke and audit individual services
8. **Secure your .env files** — Add `.env` to `.gitignore` to prevent accidental commits

## Troubleshooting

### Authentication Fails

- Verify Client ID and Client Secret are correct
- Ensure the API URL is correct (cloud: `https://app.infisical.com`)
- Check that the Machine Identity is active in Infisical
- Verify network connectivity to Infisical API

### Secret Not Found

- Confirm the secret name is spelled correctly
- Verify the project ID is correct
- Check that the environment matches where the secret exists
- Ensure the Machine Identity has access to the project/environment

### Rate Limiting

The Infisical API has rate limits. If you're hitting them:
- Implement caching to reduce API calls
- Use `listSecrets()` instead of multiple `getSecret()` calls
- Increase TTL on your cache

## Additional Resources

- **Official Python SDK**: https://github.com/infisical/sdk-py
- **Infisical Documentation**: https://infisical.com/docs
- **Universal Auth Docs**: https://infisical.com/docs/documentation/authentication/universal-auth
- **API Reference**: https://infisical.com/docs/api-reference/overview
