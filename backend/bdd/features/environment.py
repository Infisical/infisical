import json
import os

import pathlib
import httpx
from behave.runner import Context
from dotenv import load_dotenv
from faker import Faker
import logging

load_dotenv()
logger = logging.getLogger(__name__)

BASE_URL = os.environ.get("INFISICAL_API_URL", "http://localhost:8080")
PROJECT_ID = os.environ.get("PROJECT_ID")
CERT_CA_ID = os.environ.get("CERT_CA_ID")
CERT_TEMPLATE_ID = os.environ.get("CERT_TEMPLATE_ID")
AUTH_TOKEN = os.environ.get("INFISICAL_TOKEN")
BOOTSTRAP_INFISICAL = int(os.environ.get("BOOTSTRAP_INFISICAL", 0))


# Called mostly from a CI to setup the new Infisical instance to get it ready for BDD tests
def bootstrap_infisical(context: Context):
    bootstrap_result_file = pathlib.Path.cwd() / ".bootstrap-result.json"
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
            "/api/v1/pki/ca/internal",
            headers=headers,
            json={
                "projectId": project["id"],
                "name": ca_slug,
                "type": "internal",
                "status": "active",
                "enableDirectIssuance": True,
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
        ca = body["certificateAuthorities"]

        cert_template_slug = faker.slug()
        resp = client.post(
            "/api/v2/certificate-templates",
            headers=headers,
            json={
                "projectId": project["id"],
                "name": cert_template_slug,
                "description": "",
                "subject": [{"type": "common_name", "allowed": ["*"]}],
                "sans": [],
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
    if BOOTSTRAP_INFISICAL:
        details = bootstrap_infisical(context)
        context.vars = {
            "BASE_URL": BASE_URL,
            "PROJECT_ID": details["project"]["id"],
            "CERT_CA_ID": details["ca"]["id"],
            "CERT_TEMPLATE_ID": details["cert_template"]["id"],
            "AUTH_TOKEN": details["auth_token"],
        }
    else:
        context.vars = {
            "BASE_URL": BASE_URL,
            "PROJECT_ID": PROJECT_ID,
            "CERT_CA_ID": CERT_CA_ID,
            "CERT_TEMPLATE_ID": CERT_TEMPLATE_ID,
            "AUTH_TOKEN": AUTH_TOKEN,
        }
    context.http_client = httpx.Client(base_url=BASE_URL)
