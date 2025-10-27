import os

import httpx
from behave.runner import Context

BASE_URL = os.environ.get("INFISICAL_API_URL", "http://localhost:8080")
AUTH_TOKEN = os.environ.get("INFISICAL_TOKEN")


def before_all(context: Context):
    context.vars = {}
    context.http_client = httpx.Client(
        base_url=BASE_URL,  # headers={"Authorization": f"Bearer {AUTH_TOKEN}"}
    )
