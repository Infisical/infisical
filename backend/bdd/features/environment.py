import os

import httpx
from behave.runner import Context
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.environ.get("INFISICAL_API_URL", "http://localhost:8080")
PROJECT_ID = os.environ.get("PROJECT_ID")
CERT_CA_ID = os.environ.get("CERT_CA_ID")
CERT_TEMPLATE_ID = os.environ.get("CERT_TEMPLATE_ID")
AUTH_TOKEN = os.environ.get("INFISICAL_TOKEN")


def before_all(context: Context):
    context.vars = {
        "BASE_URL": BASE_URL,
        "PROJECT_ID": PROJECT_ID,
        "CERT_CA_ID": CERT_CA_ID,
        "CERT_TEMPLATE_ID": CERT_TEMPLATE_ID,
        "AUTH_TOKEN": AUTH_TOKEN,
    }
    context.http_client = httpx.Client(
        base_url=BASE_URL,  # headers={"Authorization": f"Bearer {AUTH_TOKEN}"}
    )
