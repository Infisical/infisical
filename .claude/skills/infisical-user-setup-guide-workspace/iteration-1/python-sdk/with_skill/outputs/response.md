# Python Flask + Infisical SDK Setup Guide

This guide walks you through setting up a Python Flask app to pull secrets from Infisical using the Python SDK with Universal Auth. We'll cover installation, authentication, and fetching secrets end to end.

## Prerequisites

- Python 3.7+ installed
- An Infisical account (cloud or self-hosted instance)
- A project created in Infisical
- A machine identity configured in your Infisical organization (we'll cover this below)

## Step 1: Create a Machine Identity in Infisical

A machine identity is how your Flask app will authenticate with Infisical.

1. In the Infisical dashboard, go to **Organization Settings > Access Control > Machine Identities**
2. Click **Create Identity**
3. Give it a descriptive name (e.g., `flask-app-prod` or `my-flask-server`)
4. Assign an organization-level role
5. Click **Create**

After creation, add it to your specific project with a project-level role that has read access to secrets.

## Step 2: Generate Universal Auth Credentials

1. In your machine identity's details page, go to the **Auth** or **Authentication** section
2. Click **Add Auth Method** and select **Universal Auth**
3. Configure the settings if needed (Access Token TTL defaults are usually fine)
4. Click **Create Client Secret**
5. **Save both the Client ID and Client Secret** somewhere secure (you'll use them in Step 4)

**Important:** Treat these credentials like passwords. Never commit them to version control.

## Step 3: Install the Infisical Python SDK

In your Flask project directory, install the package:

```bash
pip install infisicalsdk
```

Verify the installation:

```bash
python -c "from infisical_sdk import InfisicalSDKClient; print('SDK installed successfully')"
```

## Step 4: Set Up Your Flask App

Create a simple Flask app that authenticates with Infisical and fetches secrets. Here's a minimal example:

### Option A: Basic Setup (Environment Variables)

Create `app.py`:

```python
from flask import Flask
from infisical_sdk import InfisicalSDKClient
import os

app = Flask(__name__)

# Initialize the Infisical SDK client
client = InfisicalSDKClient(
    host="https://app.infisical.com",  # Or your self-hosted URL
    cache_ttl=60  # Cache secrets for 60 seconds
)

# Authenticate using Universal Auth
# Load credentials from environment variables (more secure than hardcoding)
client.auth.universal_auth.login(
    client_id=os.getenv("INFISICAL_CLIENT_ID"),
    client_secret=os.getenv("INFISICAL_CLIENT_SECRET")
)

@app.route("/")
def hello():
    # Fetch a secret from Infisical
    secret = client.secrets.get_secret(
        secret_name="API_KEY",  # The name of your secret
        project_id=os.getenv("INFISICAL_PROJECT_ID"),
        environment_slug="prod"  # or "dev", "staging", etc.
    )

    return f"API Key retrieved: {secret.secret_value[:10]}..."  # Display only first 10 chars

@app.route("/list-secrets")
def list_all():
    # List all secrets in the project
    secrets = client.secrets.list_secrets(
        project_id=os.getenv("INFISICAL_PROJECT_ID"),
        environment_slug="dev",
        secret_path="/"
    )

    # Return secret names (not values) for safety
    secret_names = [s.secret_name for s in secrets]
    return {"secrets": secret_names}

if __name__ == "__main__":
    app.run(debug=False, port=5000)
```

### Option B: Production Setup (Initialization File)

For larger apps, initialize the client in a separate module:

Create `infisical_client.py`:

```python
import os
from infisical_sdk import InfisicalSDKClient

def get_infisical_client():
    """Initialize and authenticate the Infisical SDK client."""
    client = InfisicalSDKClient(
        host=os.getenv("INFISICAL_URL", "https://app.infisical.com"),
        cache_ttl=60
    )

    client.auth.universal_auth.login(
        client_id=os.getenv("INFISICAL_CLIENT_ID"),
        client_secret=os.getenv("INFISICAL_CLIENT_SECRET")
    )

    return client

# Singleton pattern: initialize once on app startup
_client = None

def init_infisical():
    global _client
    if _client is None:
        _client = get_infisical_client()
    return _client

def get_secret(secret_name, environment="prod"):
    """Fetch a secret by name."""
    client = init_infisical()
    secret = client.secrets.get_secret(
        secret_name=secret_name,
        project_id=os.getenv("INFISICAL_PROJECT_ID"),
        environment_slug=environment
    )
    return secret.secret_value

def list_secrets(environment="prod", path="/"):
    """List all secrets in an environment."""
    client = init_infisical()
    return client.secrets.list_secrets(
        project_id=os.getenv("INFISICAL_PROJECT_ID"),
        environment_slug=environment,
        secret_path=path
    )
```

Then in `app.py`:

```python
from flask import Flask
from infisical_client import init_infisical, get_secret
import os

app = Flask(__name__)

# Initialize Infisical on startup
with app.app_context():
    init_infisical()

@app.route("/")
def hello():
    api_key = get_secret("API_KEY", environment="prod")
    return f"Secret retrieved successfully"

@app.route("/config/<secret_name>")
def get_config(secret_name):
    try:
        value = get_secret(secret_name)
        return {"secret": secret_name, "status": "retrieved"}
    except Exception as e:
        return {"error": str(e)}, 500

if __name__ == "__main__":
    app.run(debug=False)
```

## Step 5: Set Environment Variables

Create a `.env` file (never commit this to version control):

```bash
INFISICAL_CLIENT_ID=your_client_id_here
INFISICAL_CLIENT_SECRET=your_client_secret_here
INFISICAL_PROJECT_ID=your_project_id_here
INFISICAL_URL=https://app.infisical.com
```

Load it before running your app:

```bash
# On Linux/Mac
export $(cat .env | xargs)
python app.py

# Or use python-dotenv for automatic loading
pip install python-dotenv
```

Then update your app to use python-dotenv:

```python
from dotenv import load_dotenv
import os

load_dotenv()  # Load from .env file

client = InfisicalSDKClient(host=os.getenv("INFISICAL_URL"))
```

## Step 6: Run Your Flask App

```bash
pip install flask python-dotenv  # Install Flask if not already installed
python app.py
```

Visit `http://localhost:5000` and you should see your secret retrieved!

## Available SDK Methods

The Python SDK provides several methods for working with secrets:

```python
# Get a single secret
secret = client.secrets.get_secret(
    secret_name="DATABASE_URL",
    project_id="proj_123",
    environment_slug="prod"
)
print(secret.secret_value)

# List all secrets
secrets = client.secrets.list_secrets(
    project_id="proj_123",
    environment_slug="prod",
    secret_path="/"
)

# Create a secret (if your role allows)
client.secrets.create_secret(
    secret_name="NEW_API_KEY",
    secret_value="secret_value_here",
    project_id="proj_123",
    environment_slug="dev"
)

# Update a secret (if your role allows)
client.secrets.update_secret(
    secret_name="API_KEY",
    secret_value="new_value",
    project_id="proj_123",
    environment_slug="dev"
)

# Delete a secret (if your role allows)
client.secrets.delete_secret(
    secret_name="OLD_KEY",
    project_id="proj_123",
    environment_slug="dev"
)
```

## Caching Behavior

The SDK caches secrets by default (set via `cache_ttl` in milliseconds). This means:
- Secrets are fetched once and cached for the duration
- If a request fails, cached values are used
- If no cache exists and a request fails, it falls back to environment variables
- Set `cache_ttl=None` to disable caching (not recommended for production)

## Error Handling

Add proper error handling to your Flask routes:

```python
from infisical_sdk import InfisicalSDKException

@app.route("/secret/<name>")
def get_secret_safe(name):
    try:
        secret = client.secrets.get_secret(
            secret_name=name,
            project_id=os.getenv("INFISICAL_PROJECT_ID"),
            environment_slug="prod"
        )
        return {"status": "success"}
    except InfisicalSDKException as e:
        return {"error": "Failed to fetch secret"}, 500
    except Exception as e:
        return {"error": "Unexpected error"}, 500
```

## Security Best Practices

1. **Never hardcode credentials** — Always use environment variables or a secrets manager
2. **Use `.gitignore`** — Add `.env` to prevent accidental commits:
   ```
   .env
   .env.local
   ```
3. **Rotate credentials regularly** — Generate new Client Secrets periodically in Infisical
4. **Restrict machine identity permissions** — Give each app only the access it needs
5. **Use different identities per environment** — Separate `flask-app-prod` from `flask-app-dev`
6. **Never log secret values** — Always mask or omit them in logs
7. **Use HTTPS in production** — Infisical API calls should always be over HTTPS

## Troubleshooting

**"Authentication failed"**
- Verify Client ID and Client Secret are correct
- Check if the machine identity has the correct role in the project
- Ensure the identity hasn't been disabled

**"Secret not found"**
- Verify the secret name matches exactly (case-sensitive)
- Check the environment slug (e.g., `prod` vs `production`)
- Confirm the secret exists in Infisical

**"Connection refused" or timeout**
- Check if `INFISICAL_URL` is correct
- Verify network connectivity to Infisical
- For self-hosted, ensure Infisical is running and accessible

**"Permission denied"**
- Check the machine identity's role in the project
- Ensure the role has read access to secrets

## Next Steps

- **Dockerfile**: If you're containerizing your Flask app, see the docker-integration guide for injecting secrets at runtime
- **CI/CD**: For deployment pipelines, consider using OIDC Auth instead of Universal Auth (zero-secret)
- **Dynamic Secrets**: For database credentials or API keys that need auto-rotation, check the SDK docs for dynamic secret support

## Resources

- [Infisical Python SDK Documentation](https://infisical.com/docs/sdks/python)
- [Machine Identity Authentication Guide](https://infisical.com/docs/machine-identities)
- [Flask Documentation](https://flask.palletsprojects.com/)

---

That's it! Your Flask app is now pulling secrets from Infisical securely. Questions? Check the docs or reach out to the Infisical community.
