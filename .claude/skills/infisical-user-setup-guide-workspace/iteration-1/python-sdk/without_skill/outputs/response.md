# Setting Up Infisical Python SDK with Universal Auth in Flask

This guide walks you through installing the Infisical Python SDK, configuring Universal Auth, and fetching secrets in a Flask application.

## Prerequisites

- Python 3.7 or higher
- pip package manager
- An Infisical instance (cloud or self-hosted)
- A project in Infisical with at least one secret
- Universal Auth credentials (Client ID and Client Secret)

## Step 1: Install the Infisical Python SDK

Install the SDK using pip:

```bash
pip install infisical
```

Or add it to your `requirements.txt`:

```
infisical>=3.0.0
```

Then install dependencies:

```bash
pip install -r requirements.txt
```

## Step 2: Set Up Universal Auth Credentials

Before authenticating, you need to create Universal Auth credentials in Infisical:

1. **In Infisical Dashboard:**
   - Navigate to your project
   - Go to **Settings** → **API Keys** (or **Authentication**)
   - Create a new **Universal Auth** credential
   - Note the **Client ID** and **Client Secret**

2. **Store credentials securely:**
   - Never hardcode credentials in your source code
   - Use environment variables or a `.env` file (for development only)
   - For production, use secure secret management

Example `.env` file (development only):

```
INFISICAL_CLIENT_ID=your_client_id_here
INFISICAL_CLIENT_SECRET=your_client_secret_here
INFISICAL_WORKSPACE_ID=your_workspace_id
INFISICAL_PROJECT_SLUG=your_project_slug
INFISICAL_ENVIRONMENT=prod
```

Load the `.env` file using `python-dotenv`:

```bash
pip install python-dotenv
```

## Step 3: Create a Flask App with Infisical Integration

Here's a complete example of a Flask application that fetches secrets from Infisical:

```python
import os
from flask import Flask, jsonify
from dotenv import load_dotenv
from infisical import client as infisical_client

# Load environment variables from .env file
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Initialize Infisical client with Universal Auth
def init_infisical():
    """Initialize and authenticate with Infisical using Universal Auth"""
    client = infisical_client.InfisicalClient(
        client_id=os.getenv("INFISICAL_CLIENT_ID"),
        client_secret=os.getenv("INFISICAL_CLIENT_SECRET"),
    )
    return client

# Create a global client instance
infisical = init_infisical()

@app.route("/secrets", methods=["GET"])
def get_secrets():
    """Fetch all secrets from Infisical"""
    try:
        # Retrieve secrets from your project
        secrets = infisical.listSecrets(
            environment=os.getenv("INFISICAL_ENVIRONMENT", "prod"),
            project_id=os.getenv("INFISICAL_PROJECT_SLUG"),
        )

        # Convert to a serializable format
        secrets_list = [
            {
                "key": secret.get("secretKey"),
                "value": secret.get("secretValue"),
                "type": secret.get("type", "personal"),
            }
            for secret in secrets
        ]

        return jsonify({
            "status": "success",
            "data": secrets_list
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/secret/<secret_key>", methods=["GET"])
def get_secret(secret_key):
    """Fetch a specific secret by key"""
    try:
        secret = infisical.getSecret(
            secret_key=secret_key,
            environment=os.getenv("INFISICAL_ENVIRONMENT", "prod"),
            project_id=os.getenv("INFISICAL_PROJECT_SLUG"),
        )

        return jsonify({
            "status": "success",
            "key": secret.get("secretKey"),
            "value": secret.get("secretValue"),
            "type": secret.get("type", "personal"),
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "Flask + Infisical"
    }), 200

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
```

## Step 4: Advanced Configuration (Optional)

### Custom Infisical Host (Self-Hosted)

If you're using a self-hosted Infisical instance:

```python
client = infisical_client.InfisicalClient(
    client_id=os.getenv("INFISICAL_CLIENT_ID"),
    client_secret=os.getenv("INFISICAL_CLIENT_SECRET"),
    site_url="https://your-self-hosted-domain.com",  # Your Infisical URL
)
```

### Caching Secrets

For production, cache secrets to reduce API calls:

```python
from functools import lru_cache
from datetime import datetime, timedelta

class SecretCache:
    def __init__(self, ttl_seconds=3600):
        self.cache = {}
        self.ttl = ttl_seconds
        self.timestamps = {}

    def is_expired(self, key):
        if key not in self.timestamps:
            return True
        return datetime.now() - self.timestamps[key] > timedelta(seconds=self.ttl)

    def get(self, key):
        if key in self.cache and not self.is_expired(key):
            return self.cache[key]
        return None

    def set(self, key, value):
        self.cache[key] = value
        self.timestamps[key] = datetime.now()

cache = SecretCache(ttl_seconds=3600)

@app.route("/secret/<secret_key>", methods=["GET"])
def get_secret(secret_key):
    """Fetch a specific secret with caching"""
    cached_value = cache.get(secret_key)
    if cached_value:
        return jsonify({
            "status": "success",
            "value": cached_value,
            "source": "cache"
        }), 200

    try:
        secret = infisical.getSecret(
            secret_key=secret_key,
            environment=os.getenv("INFISICAL_ENVIRONMENT", "prod"),
            project_id=os.getenv("INFISICAL_PROJECT_SLUG"),
        )

        secret_value = secret.get("secretValue")
        cache.set(secret_key, secret_value)

        return jsonify({
            "status": "success",
            "value": secret_value,
            "source": "infisical"
        }), 200

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
```

## Step 5: Run Your Flask App

### Development

```bash
export INFISICAL_CLIENT_ID="your_client_id"
export INFISICAL_CLIENT_SECRET="your_client_secret"
export INFISICAL_PROJECT_SLUG="your_project_slug"
export INFISICAL_ENVIRONMENT="prod"

python app.py
```

The app will start at `http://localhost:5000`.

### Testing Endpoints

Fetch all secrets:
```bash
curl http://localhost:5000/secrets
```

Fetch a specific secret:
```bash
curl http://localhost:5000/secret/DATABASE_URL
```

Health check:
```bash
curl http://localhost:5000/health
```

## Step 6: Production Deployment

### Using Environment Variables

Store credentials in your deployment platform's environment variables:
- **AWS Lambda/ECS**: Use Secrets Manager or Parameter Store
- **Heroku**: Use Config Vars
- **Docker**: Pass as `--env` or in `.env` file (not in image)
- **Kubernetes**: Use Secrets

### Error Handling

Add proper error handling for production:

```python
from flask import Flask
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.errorhandler(Exception)
def handle_error(error):
    logger.error(f"Error fetching secret: {str(error)}")
    return jsonify({
        "status": "error",
        "message": "Failed to fetch secret"
    }), 500
```

## Troubleshooting

### 1. Authentication Failed
- **Issue**: `401 Unauthorized` error
- **Solution**: Verify Client ID and Client Secret are correct in `.env` or environment variables

### 2. Secret Not Found
- **Issue**: `404 Not Found` when fetching a secret
- **Solution**: Confirm the secret key exists in your Infisical project and environment

### 3. Connection Timeout
- **Issue**: Request times out when connecting to Infisical
- **Solution**:
  - Check your network/firewall
  - Verify the Infisical URL is correct and accessible
  - For self-hosted, ensure the server is running

### 4. Import Error
- **Issue**: `ModuleNotFoundError: No module named 'infisical'`
- **Solution**: Install the SDK: `pip install infisical`

## Best Practices

1. **Never commit credentials** — Use `.env` files and add to `.gitignore`
2. **Use environment variables** — Keep credentials out of source code
3. **Cache secrets** — Reduce API calls with reasonable TTLs
4. **Log securely** — Never log secret values
5. **Handle errors gracefully** — Provide meaningful error messages without exposing sensitive data
6. **Rotate credentials regularly** — Update Client Secret periodically
7. **Use appropriate permissions** — Grant minimal required access to secrets in Infisical

## Resources

- [Infisical Python SDK Documentation](https://infisical.com/docs)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [Environment Variables Best Practices](https://12factor.net/config)
