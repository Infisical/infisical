import os

import httpx
from behave.runner import Context
from dotenv import load_dotenv
import logging

logging.getLogger("httpx").setLevel(logging.DEBUG)

load_dotenv()

BASE_URL = os.environ.get("INFISICAL_API_URL", "http://localhost:8080")
PROJECT_ID = os.environ.get("PROJECT_ID", "c051e74c-48a7-4724-832c-d5b496698546")
CERT_CA_ID = os.environ.get("CERT_CA_ID", "2f0d9820-e5a8-48bb-aac8-deed9d868a1e")
CERT_TEMPLATE_ID = os.environ.get(
    "CERT_TEMPLATE_ID", "4dbf6bb0-6e86-4ee6-8550-9171428c8e82"
)
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
