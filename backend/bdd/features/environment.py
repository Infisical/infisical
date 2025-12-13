import json
import os

import pathlib
import typing
from copy import deepcopy

import httpx
from behave.runner import Context
from dotenv import load_dotenv
from faker import Faker
import logging

from features.steps.utils import clean_all_nock, restore_nock

load_dotenv()
logger = logging.getLogger(__name__)

BASE_URL = os.environ.get("INFISICAL_API_URL", "http://localhost:8080")
PEBBLE_URL = os.environ.get("PEBBLE_URL", "https://pebble:14000/dir")
PROJECT_ID = os.environ.get("PROJECT_ID")
CERT_CA_ID = os.environ.get("CERT_CA_ID")
CERT_TEMPLATE_ID = os.environ.get("CERT_TEMPLATE_ID")
AUTH_TOKEN = os.environ.get("INFISICAL_TOKEN")
BOOTSTRAP_INFISICAL = int(os.environ.get("BOOTSTRAP_INFISICAL", 0))
TECHNITIUM_URL = os.environ.get("TECHNITIUM_URL", "http://localhost:5380")
TECHNITIUM_USER = os.environ.get("TECHNITIUM_USER", "admin")
TECHNITIUM_PASSWORD = os.environ.get("TECHNITIUM_PASSWORD", "infisical")


# Called mostly from a CI to setup the new Infisical instance to get it ready for BDD tests
def bootstrap_infisical(context: Context):
    bootstrap_result_file = pathlib.Path.cwd() / ".bdd-infisical-bootstrap-result.json"
    if bootstrap_result_file.exists():
        logger.info(
            "Bootstrap result file exists at %s, loading it now", bootstrap_result_file
        )
        return json.loads(bootstrap_result_file.read_text())

    faker = Faker()
    with httpx.Client(base_url=BASE_URL) as client:
        resp = client.post(
            "/api/v1/admin/signup",
            json={
                "email": f"{faker.user_name()}@infisical.com",
                "password": faker.password(),
                "firstName": faker.first_name(),
                "lastName": faker.last_name(),
            },
        )
        resp.raise_for_status()
        body = resp.json()
        org = body["organization"]
        user = body["user"]
        temp_token = body["token"]

        resp = client.post(
            "/api/v3/auth/select-organization",
            headers={"Authorization": f"Bearer {temp_token}"},
            json={"organizationId": org["id"]},
        )
        resp.raise_for_status()
        body = resp.json()
        temp_token = body["token"]

        resp = client.post(
            "/api/v1/auth/token",
            headers={"Authorization": f"Bearer {temp_token}"},
            json={},
        )
        resp.raise_for_status()
        body = resp.json()
        auth_token = body["token"]
        headers = dict(authorization=f"Bearer {auth_token}")

        project_slug = faker.slug()
        resp = client.post(
            "/api/v1/projects",
            headers=headers,
            json={
                "projectName": project_slug,
                "projectDescription": faker.paragraph(),
                "template": "default",
                "type": "cert-manager",
            },
        )
        resp.raise_for_status()
        body = resp.json()
        project = body["project"]

        ca_slug = faker.slug()
        resp = client.post(
            "/api/v1/cert-manager/ca/internal",
            headers=headers,
            json={
                "projectId": project["id"],
                "name": ca_slug,
                "type": "internal",
                "status": "active",
                "configuration": {
                    "type": "root",
                    "organization": "Infisican Inc",
                    "ou": "",
                    "country": "",
                    "province": "",
                    "locality": "",
                    "commonName": "",
                    "notAfter": "2035-11-07",
                    "maxPathLength": -1,
                    "keyAlgorithm": "RSA_2048",
                },
            },
        )
        resp.raise_for_status()
        body = resp.json()
        ca = body

        cert_template_slug = faker.slug()
        resp = client.post(
            "/api/v1/cert-manager/certificate-templates",
            headers=headers,
            json={
                "projectId": project["id"],
                "name": cert_template_slug,
                "description": "",
                "subject": [{"type": "common_name", "allowed": ["*"]}],
                "sans": [{"type": "dns_name", "allowed": ["*"]}],
                "keyUsages": {
                    "required": [],
                    "allowed": [
                        "digital_signature",
                        "non_repudiation",
                        "key_encipherment",
                        "data_encipherment",
                        "key_agreement",
                        "key_cert_sign",
                        "crl_sign",
                        "encipher_only",
                        "decipher_only",
                    ],
                },
                "extendedKeyUsages": {
                    "required": [],
                    "allowed": [
                        "client_auth",
                        "server_auth",
                        "code_signing",
                        "email_protection",
                        "ocsp_signing",
                        "time_stamping",
                    ],
                },
                "algorithms": {
                    "signature": [
                        "SHA256-RSA",
                        "SHA512-RSA",
                        "SHA384-ECDSA",
                        "SHA384-RSA",
                        "SHA256-ECDSA",
                        "SHA512-ECDSA",
                    ],
                    "keyAlgorithm": [
                        "RSA-2048",
                        "RSA-4096",
                        "ECDSA-P384",
                        "RSA-3072",
                        "ECDSA-P256",
                        "ECDSA-P521",
                    ],
                },
                "validity": {"max": "365d"},
            },
        )
        resp.raise_for_status()
        body = resp.json()
        cert_template = body["certificateTemplate"]

    bootstrap_result = dict(
        org=org,
        user=user,
        project=project,
        ca=ca,
        cert_template=cert_template,
        auth_token=auth_token,
    )
    bootstrap_result_file.write_text(json.dumps(bootstrap_result))
    return bootstrap_result


def before_all(context: Context):
    base_vars = {
        "BASE_URL": BASE_URL,
        "PEBBLE_URL": PEBBLE_URL,
        "TECHNITIUM_URL": TECHNITIUM_URL,
        "TECHNITIUM_USER": TECHNITIUM_USER,
        "TECHNITIUM_PASSWORD": TECHNITIUM_PASSWORD,
    }
    if BOOTSTRAP_INFISICAL:
        details = bootstrap_infisical(context)
        vars = base_vars | {
            "PROJECT_ID": details["project"]["id"],
            "CERT_CA_ID": details["ca"]["id"],
            "CERT_TEMPLATE_ID": details["cert_template"]["id"],
            "AUTH_TOKEN": details["auth_token"],
        }
    else:
        vars = base_vars | {
            "PROJECT_ID": PROJECT_ID,
            "CERT_CA_ID": CERT_CA_ID,
            "CERT_TEMPLATE_ID": CERT_TEMPLATE_ID,
            "AUTH_TOKEN": AUTH_TOKEN,
        }
    context._initial_vars = vars
    context.http_client = httpx.Client(base_url=BASE_URL)
    context.technitium_http_client = httpx.Client(base_url=TECHNITIUM_URL)


def before_scenario(context: Context, scenario: typing.Any):
    context.vars = deepcopy(context._initial_vars)


def after_scenario(context: Context, scenario: typing.Any):
    if hasattr(context, "web_server"):
        context.web_server.shutdown_and_server_close()
    clean_all_nock(context)
    restore_nock(context)
