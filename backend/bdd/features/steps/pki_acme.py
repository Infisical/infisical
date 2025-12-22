import json
import logging
import re
import urllib.parse
import time
import threading

import acme.client
import jq
from faker import Faker
from acme import client
from acme import messages
from acme import standalone
from acme.jws import Signature
from behave.runner import Context
from behave import given
from behave import when
from behave import then
from josepy.jwk import JWKRSA
from josepy import json_util
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.types import (
    CertificateIssuerPrivateKeyTypes,
)
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes

from features.steps.utils import define_nock, clean_all_nock, restore_nock
from utils import replace_vars, with_nocks
from utils import eval_var
from utils import prepare_headers


ACC_KEY_BITS = 2048
ACC_KEY_PUBLIC_EXPONENT = 65537
logger = logging.getLogger(__name__)
faker = Faker()


class AcmeProfile:
    def __init__(self, id: str, eab_kid: str, eab_secret: str):
        self.id = id
        self.eab_kid = eab_kid
        self.eab_secret = eab_secret


@given("I make a random {faker_type} as {var_name}")
def step_impl(context: Context, faker_type: str, var_name: str):
    context.vars[var_name] = getattr(faker, faker_type)()


@given('I have an ACME cert profile as "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    profile_id = context.vars.get("PROFILE_ID")
    secret = context.vars.get("EAB_SECRET")
    if profile_id is not None and secret is not None:
        kid = profile_id
    else:
        profile_slug = faker.slug()
        jwt_token = context.vars["AUTH_TOKEN"]
        response = context.http_client.post(
            "/api/v1/cert-manager/certificate-profiles",
            headers=dict(authorization="Bearer {}".format(jwt_token)),
            json={
                "projectId": context.vars["PROJECT_ID"],
                "slug": profile_slug,
                "description": "ACME Profile created by BDD test",
                "enrollmentType": "acme",
                "caId": context.vars["CERT_CA_ID"],
                "certificateTemplateId": context.vars["CERT_TEMPLATE_ID"],
                "acmeConfig": {},
            },
        )
        response.raise_for_status()
        resp_json = response.json()
        profile_id = resp_json["certificateProfile"]["id"]
        kid = profile_id

        response = context.http_client.get(
            f"/api/v1/cert-manager/certificate-profiles/{profile_id}/acme/eab-secret/reveal",
            headers=dict(authorization="Bearer {}".format(jwt_token)),
        )
        response.raise_for_status()
        resp_json = response.json()
        secret = resp_json["eabSecret"]

    context.vars[profile_var] = AcmeProfile(
        profile_id,
        eab_kid=kid,
        eab_secret=secret,
    )


@given("I create a Cloudflare connection as {var_name}")
def step_impl(context: Context, var_name: str):
    jwt_token = context.vars["AUTH_TOKEN"]
    conn_slug = faker.slug()
    mock_account_id = "MOCK_ACCOUNT_ID"
    with with_nocks(
        context,
        definitions=[
            {
                "scope": "https://api.cloudflare.com:443",
                "method": "GET",
                "path": f"/client/v4/accounts/{mock_account_id}",
                "status": 200,
                "response": {
                    "result": {
                        "id": "A2A6347F-88B5-442D-9798-95E408BC7701",
                        "name": "Mock Account",
                        "type": "standard",
                        "settings": {
                            "enforce_twofactor": True,
                            "api_access_enabled": None,
                            "access_approval_expiry": None,
                            "abuse_contact_email": None,
                            "user_groups_ui_beta": False,
                        },
                        "legacy_flags": {
                            "enterprise_zone_quota": {
                                "maximum": 0,
                                "current": 0,
                                "available": 0,
                            }
                        },
                        "created_on": "2013-04-18T00:41:02.215243Z",
                    },
                    "success": True,
                    "errors": [],
                    "messages": [],
                },
                "responseIsBinary": False,
            }
        ],
    ):
        response = context.http_client.post(
            "/api/v1/app-connections/cloudflare",
            headers=dict(authorization="Bearer {}".format(jwt_token)),
            json={
                "name": conn_slug,
                "description": "",
                "method": "api-token",
                "credentials": {
                    "apiToken": "MOCK_API_TOKEN",
                    "accountId": mock_account_id,
                },
            },
        )
    response.raise_for_status()
    context.vars[var_name] = response


@given("I create a DNS Made Easy connection as {var_name}")
def step_impl(context: Context, var_name: str):
    jwt_token = context.vars["AUTH_TOKEN"]
    conn_slug = faker.slug()
    with with_nocks(
        context,
        definitions=[
            {
                "scope": "https://api.dnsmadeeasy.com:443",
                "method": "GET",
                "path": "/V2.0/dns/managed/",
                "status": 200,
                "response": {"totalRecords": 0, "totalPages": 1, "data": [], "page": 0},
                "responseIsBinary": False,
            }
        ],
    ):
        response = context.http_client.post(
            "/api/v1/app-connections/dns-made-easy",
            headers=dict(authorization="Bearer {}".format(jwt_token)),
            json={
                "name": conn_slug,
                "description": "",
                "method": "api-key-secret",
                "credentials": {
                    "apiKey": "MOCK_API_KEY",
                    "secretKey": "MOCK_SECRET_KEY",
                },
            },
        )
    response.raise_for_status()
    context.vars[var_name] = response


@given("I create a external ACME CA with the following config as {var_name}")
def step_impl(context: Context, var_name: str):
    jwt_token = context.vars["AUTH_TOKEN"]
    ca_slug = faker.slug()
    config = replace_vars(json.loads(context.text), context.vars)
    response = context.http_client.post(
        "/api/v1/cert-manager/ca/acme",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
        json={
            "projectId": context.vars["PROJECT_ID"],
            "name": ca_slug,
            "type": "acme",
            "status": "active",
            "enableDirectIssuance": True,
            "configuration": config,
        },
    )
    response.raise_for_status()
    context.vars[var_name] = response


@given("I create a certificate template with the following config as {var_name}")
def step_impl(context: Context, var_name: str):
    jwt_token = context.vars["AUTH_TOKEN"]
    template_slug = faker.slug()
    config = replace_vars(json.loads(context.text), context.vars)
    response = context.http_client.post(
        "/api/v1/cert-manager/certificate-templates",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
        json={
            "projectId": context.vars["PROJECT_ID"],
            "name": template_slug,
            "description": "",
        }
        | config,
    )
    response.raise_for_status()
    context.vars[var_name] = response


@given(
    'I create an ACME profile with ca {ca_id} and template {template_id} as "{profile_var}"'
)
def step_impl(context: Context, ca_id: str, template_id: str, profile_var: str):
    profile_slug = faker.slug()
    jwt_token = context.vars["AUTH_TOKEN"]
    response = context.http_client.post(
        "/api/v1/cert-manager/certificate-profiles",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
        json={
            "projectId": context.vars["PROJECT_ID"],
            "slug": profile_slug,
            "description": "ACME Profile created by BDD test",
            "enrollmentType": "acme",
            "caId": replace_vars(ca_id, context.vars),
            "certificateTemplateId": replace_vars(template_id, context.vars),
            "acmeConfig": {},
        },
    )
    response.raise_for_status()
    resp_json = response.json()
    profile_id = resp_json["certificateProfile"]["id"]
    kid = profile_id

    response = context.http_client.get(
        f"/api/v1/cert-manager/certificate-profiles/{profile_id}/acme/eab-secret/reveal",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
    )
    response.raise_for_status()
    resp_json = response.json()
    secret = resp_json["eabSecret"]

    context.vars[profile_var] = AcmeProfile(
        profile_id,
        eab_kid=kid,
        eab_secret=secret,
    )


@given('I create an ACME profile with config as "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    profile_slug = faker.slug()
    jwt_token = context.vars["AUTH_TOKEN"]
    acme_config = replace_vars(json.loads(context.text), context.vars)
    response = context.http_client.post(
        "/api/v1/cert-manager/certificate-profiles",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
        json={
            "projectId": context.vars["PROJECT_ID"],
            "slug": profile_slug,
            "description": "ACME Profile created by BDD test",
            "enrollmentType": "acme",
            "caId": context.vars["CERT_CA_ID"],
            "certificateTemplateId": context.vars["CERT_TEMPLATE_ID"],
            "acmeConfig": acme_config,
        },
    )
    response.raise_for_status()
    resp_json = response.json()
    profile_id = resp_json["certificateProfile"]["id"]
    kid = profile_id

    response = context.http_client.get(
        f"/api/v1/cert-manager/certificate-profiles/{profile_id}/acme/eab-secret/reveal",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
    )
    response.raise_for_status()
    resp_json = response.json()
    secret = resp_json["eabSecret"]

    context.vars[profile_var] = AcmeProfile(
        profile_id,
        eab_kid=kid,
        eab_secret=secret,
    )


@given('I have an ACME cert profile with external ACME CA as "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    profile_id = context.vars.get("PROFILE_ID")
    secret = context.vars.get("EAB_SECRET")
    if profile_id is not None and secret is not None:
        kid = profile_id
    else:
        profile_slug = faker.slug()
        jwt_token = context.vars["AUTH_TOKEN"]
        response = context.http_client.post(
            "/api/v1/cert-manager/certificate-profiles",
            headers=dict(authorization="Bearer {}".format(jwt_token)),
            json={
                "projectId": context.vars["PROJECT_ID"],
                "slug": profile_slug,
                "description": "ACME Profile created by BDD test",
                "enrollmentType": "acme",
                "caId": context.vars["CERT_CA_ID"],
                "certificateTemplateId": context.vars["CERT_TEMPLATE_ID"],
                "acmeConfig": {},
            },
        )
        response.raise_for_status()
        resp_json = response.json()
        profile_id = resp_json["certificateProfile"]["id"]
        kid = profile_id

        response = context.http_client.get(
            f"/api/v1/cert-manager/certificate-profiles/{profile_id}/acme/eab-secret/reveal",
            headers=dict(authorization="Bearer {}".format(jwt_token)),
        )
        response.raise_for_status()
        resp_json = response.json()
        secret = resp_json["eabSecret"]

    context.vars[profile_var] = AcmeProfile(
        profile_id,
        eab_kid=kid,
        eab_secret=secret,
    )


@given("I intercept outgoing requests")
def step_impl(context: Context):
    definitions = replace_vars(json.loads(context.text), context.vars)
    define_nock(context, definitions)


@then("I reset requests interceptions")
def step_impl(context: Context):
    clean_all_nock(context)
    restore_nock(context)


@given("I use {token_var} for authentication")
def step_impl(context: Context, token_var: str):
    context.auth_token = eval_var(context, token_var)


@when('I send a "{method}" request to "{url}"')
def step_impl(context: Context, method: str, url: str):
    logger.debug("Sending %s request to %s", method, url)
    response = context.http_client.request(
        method, url.format(**context.vars), headers=prepare_headers(context)
    )
    context.vars["response"] = response
    logger.debug("Response status: %r", response.status_code)
    try:
        logger.debug("Response JSON payload: %r", response.json())
    except json.decoder.JSONDecodeError:
        pass


@when('I send a "{method}" request to "{url}" with JSON payload')
def step_impl(context: Context, method: str, url: str):
    json_payload = json.loads(context.text)
    json_payload = replace_vars(json_payload, context.vars)
    logger.debug(
        "Sending %s request to %s with JSON payload: %s",
        method,
        url,
        json.dumps(json_payload),
    )
    response = context.http_client.request(
        method,
        url.format(**context.vars),
        headers=prepare_headers(context),
        json=json_payload,
    )
    context.vars["response"] = response
    logger.debug("Response status: %r", response.status_code)
    logger.debug("Response JSON payload: %r", response.json())


def create_acme_client(context: Context, url: str, acc_jwk: JWKRSA | None = None):
    if acc_jwk is None:
        private_key = rsa.generate_private_key(
            public_exponent=ACC_KEY_PUBLIC_EXPONENT, key_size=ACC_KEY_BITS
        )
        pem_bytes = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        acc_jwk = JWKRSA.load(pem_bytes)
    net = client.ClientNetwork(acc_jwk)
    directory_url = url.format(**context.vars)
    directory = client.ClientV2.get_directory(directory_url, net)
    context.acme_client = client.ClientV2(directory, net=net)


@when('I have an ACME client connecting to "{url}"')
def step_impl(context: Context, url: str):
    create_acme_client(context, url)


@when('I have an ACME client connecting to "{url}" with the key pair from {client_var}')
def step_impl(context: Context, url: str, client_var: str):
    another_client = eval_var(context, client_var, as_json=False)
    create_acme_client(context, url, acc_jwk=another_client.net.key)


@then('the response status code should be "{expected_status_code:d}"')
def step_impl(context: Context, expected_status_code: int):
    assert context.vars["response"].status_code == expected_status_code, (
        f"{context.vars['response'].status_code} != {expected_status_code}"
    )


@then('the response header "{header}" should contains non-empty value')
def step_impl(context: Context, header: str):
    header_value = context.vars["response"].headers.get(header)
    assert header_value is not None, f"Header {header} not found in response"
    assert header_value, (
        f"Header {header} found in response, but value {header_value:!r} is empty"
    )


@then("the response body should match JSON value")
def step_impl(context: Context):
    payload = context.vars["response"].json()
    expected = json.loads(context.text)
    replaced = replace_vars(expected, context.vars)
    assert payload == replaced, f"{payload} != {replaced}"


@when('I use a different new-account URL "{url}" for EAB signature')
def step_impl(context: Context, url: str):
    context.alt_eab_url = replace_vars(url, context.vars)


def register_account_with_eab(
    context: Context,
    email: str,
    kid: str,
    secret: str,
    account_var: str,
    only_return_existing: bool = False,
):
    acme_client = context.acme_client
    account_public_key = acme_client.net.key.public_key()
    if not only_return_existing:
        # clear the account in case if we want to register twice
        acme_client.net.account = None
    if hasattr(context, "alt_eab_url"):
        eab_directory = messages.Directory.from_json(
            {"newAccount": context.alt_eab_url}
        )
    else:
        eab_directory = acme_client.directory
    eab = messages.ExternalAccountBinding.from_data(
        account_public_key=account_public_key,
        kid=replace_vars(kid, context.vars),
        hmac_key=replace_vars(secret, context.vars),
        directory=eab_directory,
        hmac_alg="HS256",
    )
    registration = messages.NewRegistration.from_data(
        email=email,
        external_account_binding=eab,
        only_return_existing=only_return_existing,
    )
    try:
        if not only_return_existing:
            context.vars[account_var] = acme_client.new_account(registration)
        else:
            context.vars[account_var] = acme_client.query_registration(
                acme_client.net.account
            )
    except Exception as exp:
        logger.error(f"Failed to register: {exp}", exc_info=True)
        context.vars["error"] = exp


@then(
    'I register a new ACME account with email {email} and EAB key id "{kid}" with secret "{secret}" as {account_var}'
)
def step_impl(context: Context, email: str, kid: str, secret: str, account_var: str):
    register_account_with_eab(
        context=context, email=email, kid=kid, secret=secret, account_var=account_var
    )


@then(
    'I find the existing ACME account with email {email} and EAB key id "{kid}" with secret "{secret}" as {account_var}'
)
def step_impl(context: Context, email: str, kid: str, secret: str, account_var: str):
    register_account_with_eab(
        context=context,
        email=email,
        kid=kid,
        secret=secret,
        account_var=account_var,
        only_return_existing=True,
    )


@then("I find the existing ACME account without EAB as {account_var}")
def step_impl(context: Context, account_var: str):
    acme_client = context.acme_client
    # registration = messages.RegistrationResource.from_json(dict(uri=""))
    registration = acme_client.net.account
    try:
        context.vars[account_var] = acme_client.query_registration(registration)
    except Exception as exp:
        context.vars["error"] = exp


@then("I register a new ACME account with email {email} without EAB")
def step_impl(context: Context, email: str):
    acme_client = context.acme_client
    registration = messages.NewRegistration.from_data(
        email=email,
    )
    try:
        context.vars["error"] = acme_client.new_account(registration)
    except Exception as exp:
        context.vars["error"] = exp


def send_raw_acme_req(context: Context, url: str):
    acme_client = context.acme_client
    content = json.loads(context.text)
    protected = replace_vars(content["protected"], context.vars)
    alg = acme_client.net.alg
    if "raw_payload" in content:
        encoded_payload = content["raw_payload"].encode("utf-8")
    elif "payload" in content:
        payload = (
            replace_vars(content["payload"], context.vars)
            if "payload" in content
            else None
        )
        encoded_payload = json.dumps(payload).encode() if payload is not None else b""
    else:
        encoded_payload = b""
    protected_headers = json.dumps(protected)
    signature = alg.sign(
        key=acme_client.net.key.key,
        msg=Signature._msg(protected_headers, encoded_payload),
    )
    jws = json.dumps(
        {
            "protected": json_util.encode_b64jose(protected_headers.encode()),
            "payload": json_util.encode_b64jose(encoded_payload),
            "signature": json_util.encode_b64jose(signature),
        }
    )
    base_url = context.vars["BASE_URL"]
    actual_url = urllib.parse.urljoin(base_url, replace_vars(url, context.vars))
    response = acme_client.net._send_request(
        "POST",
        actual_url,
        data=jws,
        headers={"Content-Type": acme.client.ClientNetwork.JOSE_CONTENT_TYPE},
    )
    context.vars["response"] = response


@when('I send a raw ACME request to "{url}"')
def step_impl(context: Context, url: str):
    send_raw_acme_req(context, url)


@then(
    "I encode CSR {pem_var} as JOSE Base-64 DER as {var_name}",
)
def step_impl(context: Context, pem_var: str, var_name: str):
    csr = eval_var(context, pem_var)
    parsed_csr = x509.load_pem_x509_csr(csr)
    context.vars[var_name] = json_util.encode_csr(parsed_csr)


@then(
    "I submit the certificate signing request PEM {pem_var} certificate order to the ACME server as {order_var}"
)
def step_impl(context: Context, pem_var: str, order_var: str):
    context.vars[order_var] = context.acme_client.new_order(context.vars[pem_var])


@then("I send an ACME post-as-get to {uri_path} as {res_var}")
def step_impl(context: Context, uri_path: str, res_var: str):
    uri_value = eval_var(context, uri_path)
    context.vars[res_var] = context.acme_client._post_as_get(uri_value)


@when("I create certificate signing request as {csr_var}")
def step_impl(context: Context, csr_var: str):
    context.vars[csr_var] = x509.CertificateSigningRequestBuilder()


@then("I add names to certificate signing request {csr_var}")
def step_impl(context: Context, csr_var: str):
    names = json.loads(context.text)
    builder: x509.CertificateSigningRequestBuilder = context.vars[csr_var]
    context.vars[csr_var] = builder.subject_name(
        x509.Name(
            [
                x509.NameAttribute(getattr(NameOID, name), value)
                for name, value in names.items()
            ]
        )
    )


@then("I add subject alternative name to certificate signing request {csr_var}")
def step_impl(context: Context, csr_var: str):
    names = json.loads(context.text)
    builder: x509.CertificateSigningRequestBuilder = context.vars[csr_var]
    context.vars[csr_var] = builder.add_extension(
        x509.SubjectAlternativeName([x509.DNSName(name) for name in names]),
        critical=False,
    )


def gen_private_key(key_type: str):
    if key_type == "RSA-2048" or key_type == "RSA":
        return rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
    elif key_type == "RSA-3072":
        return rsa.generate_private_key(
            public_exponent=65537,
            key_size=3072,
        )
    elif key_type == "RSA-4096":
        return rsa.generate_private_key(
            public_exponent=65537,
            key_size=4096,
        )
    elif key_type == "ECDSA-P256":
        return ec.generate_private_key(curve=ec.SECP256R1())
    elif key_type == "ECDSA-P384":
        return ec.generate_private_key(curve=ec.SECP384R1())
    elif key_type == "ECDSA-P521":
        return ec.generate_private_key(curve=ec.SECP521R1())
    else:
        raise Exception(f"Unknown key type {key_type}")


@then("I create a {key_type} private key pair as {rsa_key_var}")
def step_impl(context: Context, key_type: str, rsa_key_var: str):
    context.vars[rsa_key_var] = gen_private_key(key_type)


def sign_csr(
    pem: x509.CertificateSigningRequestBuilder,
    pk: CertificateIssuerPrivateKeyTypes,
    hash_type: str = "SHA256",
):
    return pem.sign(pk, getattr(hashes, hash_type)()).public_bytes(
        serialization.Encoding.PEM
    )


@then(
    'I sign the certificate signing request {csr_var} with "{hash_type}" hash and private key {pk_var} and output it as {pem_var} in PEM format'
)
def step_impl(
    context: Context, csr_var: str, hash_type: str, pk_var: str, pem_var: str
):
    context.vars[pem_var] = sign_csr(
        pem=context.vars[csr_var],
        pk=context.vars[pk_var],
        hash_type=hash_type,
    )


@then(
    "I sign the certificate signing request {csr_var} with private key {pk_var} and output it as {pem_var} in PEM format"
)
def step_impl(context: Context, csr_var: str, pk_var: str, pem_var: str):
    context.vars[pem_var] = sign_csr(
        pem=context.vars[csr_var],
        pk=context.vars[pk_var],
    )


@then("the value {var_path} should be true for jq {query}")
def step_impl(context: Context, var_path: str, query: str):
    value = eval_var(context, var_path)
    result = jq.compile(replace_vars(query, context.vars)).input_value(value).first()
    assert result, f"{value} does not match {query}"


def apply_value_with_jq(context: Context, var_path: str, jq_query: str):
    value = eval_var(context, var_path)
    return value, jq.compile(replace_vars(jq_query, context.vars)).input_value(
        value
    ).first()


@then('the value {var_path} with jq "{jq_query}" should be equal to json')
def step_impl(context: Context, var_path: str, jq_query: str):
    value, result = apply_value_with_jq(
        context=context,
        var_path=var_path,
        jq_query=jq_query,
    )
    expected_value = json.loads(context.text)
    assert result == expected_value, (
        f"{json.dumps(value)!r} with jq {jq_query!r}, the result {json.dumps(result)!r} does not match {json.dumps(expected_value)!r}"
    )


@then('the value {var_path} with jq "{jq_query}" should be present')
def step_impl(context: Context, var_path: str, jq_query: str):
    value, result = apply_value_with_jq(
        context=context,
        var_path=var_path,
        jq_query=jq_query,
    )
    assert result, (
        f"{json.dumps(value)!r} with jq {jq_query!r}, the result {json.dumps(result)!r} is not present"
    )


@then("the value {var_path} with should be absent")
def step_impl(context: Context, var_path: str):
    try:
        value = eval_var(context, var_path)
    except Exception as exp:
        if isinstance(exp, KeyError):
            return
        raise
    assert False, (
        f"value at {var_path!r} should be absent, but we got this instead: {value!r}"
    )


@then('the value {var_path} with jq "{jq_query}" should be equal to {expected}')
def step_impl(context: Context, var_path: str, jq_query: str, expected: str):
    value, result = apply_value_with_jq(
        context=context,
        var_path=var_path,
        jq_query=jq_query,
    )
    expected_value = replace_vars(json.loads(expected), context.vars)
    assert result == expected_value, (
        f"{json.dumps(value)!r} with jq {jq_query!r}, the result {json.dumps(result)!r} does not match {json.dumps(expected_value)!r}"
    )


@then('the value {var_path} with jq "{jq_query}" should match pattern {regex}')
def step_impl(context: Context, var_path: str, jq_query: str, regex: str):
    actual_regex = replace_vars(regex, context.vars)
    value, result = apply_value_with_jq(
        context=context,
        var_path=var_path,
        jq_query=jq_query,
    )
    assert re.match(actual_regex, result), (
        f"{json.dumps(value)!r} with jq {jq_query!r}, the result {json.dumps(result)!r} does not match {actual_regex!r}"
    )


@then("the value {var_path} should be equal to json")
def step_impl(context: Context, var_path: str):
    value = eval_var(context, var_path)
    expected_value = json.loads(context.text)
    assert value == expected_value, f"{value!r} does not match {expected_value!r}"


@then("the value {var_path} should be equal to {expected}")
def step_impl(context: Context, var_path: str, expected: str):
    value = eval_var(context, var_path)
    expected_value = replace_vars(json.loads(expected), context.vars)
    assert value == expected_value, f"{value!r} does not match {expected_value!r}"


@then("the value {var_path} should not be equal to {expected}")
def step_impl(context: Context, var_path: str, expected: str):
    value = eval_var(context, var_path)
    expected_value = replace_vars(json.loads(expected), context.vars)
    assert value != expected_value, f"{value!r} does match {expected_value!r}"


@then('I memorize {var_path} with jq "{jq_query}" as {var_name}')
def step_impl(context: Context, var_path: str, jq_query, var_name: str):
    _, value = apply_value_with_jq(
        context=context,
        var_path=var_path,
        jq_query=jq_query,
    )
    context.vars[var_name] = value


@then("I get a new-nonce as {var_name}")
def step_impl(context: Context, var_name: str):
    acme_client = context.acme_client
    nonce = acme_client.net._get_nonce(
        url=None, new_nonce_url=acme_client.directory.newNonce
    )
    context.vars[var_name] = json_util.encode_b64jose(nonce)


@then("I peak and memorize the next nonce as {var_name}")
def step_impl(context: Context, var_name: str):
    acme_client = context.acme_client
    context.vars[var_name] = json_util.encode_b64jose(list(acme_client.net._nonces)[0])


@then("I put away current ACME client as {var_name}")
def step_impl(context: Context, var_name: str):
    acme_client = context.acme_client
    del context.acme_client
    context.vars[var_name] = acme_client


@then("I memorize {var_path} as {var_name}")
def step_impl(context: Context, var_path: str, var_name: str):
    value = eval_var(context, var_path)
    context.vars[var_name] = value


@then("I print the value {var_path}")
def step_impl(context: Context, var_path: str):
    value = eval_var(context, var_path)
    print(json.dumps(value.json(), indent=2))


def select_challenge(
    context: Context,
    challenge_type: str,
    order_var_path: str,
    domain: str,
):
    acme_client = context.acme_client
    order = eval_var(context, order_var_path, as_json=False)
    if isinstance(order, dict):
        order_body = messages.Order.from_json(order)
        order = messages.OrderResource(
            body=order_body,
            authorizations=[
                acme_client._authzr_from_response(
                    acme_client._post_as_get(url), uri=url
                )
                for url in order_body.authorizations
            ],
        )
    if not isinstance(order, messages.OrderResource):
        raise ValueError(
            f"Expected OrderResource but got {type(order)!r} at {order_var_path!r}"
        )
    auths = list(
        filter(lambda o: o.body.identifier.value == domain, order.authorizations)
    )
    if not auths:
        raise ValueError(
            f"Authorization for domain {domain!r} not found in {order_var_path!r}"
        )
    if len(auths) > 1:
        raise ValueError(
            f"More than one order for domain {domain!r} found in {order_var_path!r}"
        )
    auth = auths[0]

    challenges = list(filter(lambda a: a.typ == challenge_type, auth.body.challenges))
    if not challenges:
        raise ValueError(
            f"Authorization type {challenge_type!r} not found in {order_var_path!r}"
        )
    if len(challenges) > 1:
        raise ValueError(
            f"More than one authorization for type {challenge_type!r} found in {order_var_path!r}"
        )
    return challenges[0]


def serve_challenges(
    context: Context,
    challenges: list[messages.ChallengeBody],
    wait_time: int | None = None,
):
    if hasattr(context, "web_server"):
        context.web_server.shutdown_and_server_close()

    resources = set()
    for challenge in challenges:
        response, validation = challenge.response_and_validation(
            context.acme_client.net.key
        )
        resources.add(
            standalone.HTTP01RequestHandler.HTTP01Resource(
                chall=challenge.chall, response=response, validation=validation
            )
        )
    # TODO: make port configurable
    servers = standalone.HTTP01DualNetworkedServers(("0.0.0.0", 8087), resources)
    if wait_time is None:
        servers.serve_forever()
    else:

        def wait_and_start():
            logger.info("Waiting %s seconds before we start serving.", wait_time)
            time.sleep(wait_time)
            logger.info("Start server now")
            servers.serve_forever()

        thread = threading.Thread(target=wait_and_start)
        thread.daemon = True
        thread.start()
    context.web_server = servers


def notify_challenge_ready(context: Context, challenge: messages.ChallengeBody):
    acme_client = context.acme_client
    response, validation = challenge.response_and_validation(acme_client.net.key)
    acme_client.answer_challenge(challenge, response)


@then(
    "I select challenge with type {challenge_type} for domain {domain} from order in {var_path} as {challenge_var}"
)
def step_impl(
    context: Context,
    challenge_type: str,
    domain: str,
    var_path: str,
    challenge_var: str,
):
    challenge = select_challenge(
        context=context,
        challenge_type=challenge_type,
        domain=domain,
        order_var_path=var_path,
    )
    context.vars[challenge_var] = challenge


@then("I pass all challenges with type {challenge_type} for order in {order_var_path}")
def step_impl(
    context: Context,
    challenge_type: str,
    order_var_path: str,
):
    acme_client = context.acme_client
    order = eval_var(context, order_var_path, as_json=False)
    if isinstance(order, dict):
        order_body = messages.Order.from_json(order)
        order = messages.OrderResource(
            body=order_body,
            authorizations=[
                acme_client._authzr_from_response(
                    acme_client._post_as_get(url), uri=url
                )
                for url in order_body.authorizations
            ],
        )
    if not isinstance(order, messages.OrderResource):
        raise ValueError(
            f"Expected OrderResource but got {type(order)!r} at {order_var_path!r}"
        )

    challenges = {}
    for domain in order.body.identifiers:
        logger.info(
            "Selecting challenge for domain %s with type %s ...",
            domain.value,
            challenge_type,
        )
        challenge = select_challenge(
            context=context,
            challenge_type=challenge_type,
            domain=domain.value,
            order_var_path=order_var_path,
        )
        logger.info(
            "Found challenge for domain %s with type %s, challenge=%s",
            domain.value,
            challenge_type,
            challenge.uri,
        )

        logger.info(
            "Serving challenge for domain %s with type %s ...",
            domain.value,
            challenge_type,
        )
        challenges[domain] = challenge

    serve_challenges(context=context, challenges=list(challenges.values()))
    for domain, challenge in challenges.items():
        logger.info(
            "Notifying challenge for domain %s with type %s ...", domain, challenge_type
        )
        notify_challenge_ready(context=context, challenge=challenge)


@then(
    "I wait {wait_time} seconds and serve challenge response for {var_path} at {hostname}"
)
def step_impl(context: Context, wait_time: str, var_path: str, hostname: str):
    challenge = eval_var(context, var_path, as_json=False)
    serve_challenges(context=context, challenges=[challenge], wait_time=int(wait_time))


@then("I serve challenge response for {var_path} at {hostname}")
def step_impl(context: Context, var_path: str, hostname: str):
    challenge = eval_var(context, var_path, as_json=False)
    serve_challenges(context=context, challenges=[challenge])


@then("I add domain {domain} challenge response DNS records for {var_path}")
def step_impl(context: Context, domain: str, var_path: str):
    client = context.technitium_http_client
    challenge = eval_var(context, var_path, as_json=False)

    zone = domain
    domain = f"{challenge.chall.LABEL}.{domain}"
    value = challenge.chall.validation(context.acme_client.net.key)

    resp = client.post(
        "/api/user/login",
        data={
            "user": context.vars["TECHNITIUM_USER"],
            "pass": context.vars["TECHNITIUM_PASSWORD"],
        },
    )
    resp.raise_for_status()

    token = resp.json()["token"]
    resp = client.post(
        "/api/zones/create",
        params=dict(
            token=token,
            zone=zone,
            type="Primary",
        ),
    )
    resp.raise_for_status()
    error_msg = resp.json().get("errorMessage")
    if error_msg is not None and not error_msg.startswith("Zone already exists:"):
        raise RuntimeError(f"Unexpected error while creating zone {zone}: {error_msg}")

    resp = client.post(
        "/api/zones/records/add",
        params=dict(
            token=token,
            zone=zone,
            domain=domain,
            type="TXT",
            text=value,
        ),
    )
    resp.raise_for_status()
    error_msg = resp.json().get("errorMessage")
    if error_msg is not None and not error_msg.startswith(
        "Cannot add record: record already exists"
    ):
        raise RuntimeError(
            f"Unexpected error while creating TXT record {domain} for zone {zone}: {error_msg}"
        )


@then("I tell ACME server that {var_path} is ready to be verified")
def step_impl(context: Context, var_path: str):
    challenge = eval_var(context, var_path, as_json=False)
    notify_challenge_ready(context=context, challenge=challenge)


@then("I wait until the status of order {order_var} becomes {status}")
def step_impl(context: Context, order_var: str, status: str):
    acme_client = context.acme_client
    attempt_count = 6
    while attempt_count:
        order = eval_var(context, order_var, as_json=False)
        response = acme_client._post_as_get(
            order.uri if isinstance(order, messages.OrderResource) else order
        )
        order = messages.Order.from_json(response.json())
        if order.status.name == status:
            return
        attempt_count -= 1
        time.sleep(10)
    raise TimeoutError(f"The status of order doesn't become {status} before timeout")


@then("I wait until the status of authorization {auth_var} becomes {status}")
def step_impl(context: Context, auth_var: str, status: str):
    acme_client = context.acme_client
    attempt_count = 6
    while attempt_count:
        auth = eval_var(context, auth_var, as_json=False)
        response = acme_client._post_as_get(
            auth.uri if isinstance(auth, messages.Authorization) else auth
        )
        auth = messages.Authorization.from_json(response.json())
        if auth.status.name == status:
            return
        attempt_count -= 1
        time.sleep(10)
    raise TimeoutError(f"The status of auth doesn't become {status} before timeout")


@then("I post-as-get {uri} as {resp_var}")
def step_impl(context: Context, uri: str, resp_var: str):
    acme_client = context.acme_client
    response = acme_client._post_as_get(replace_vars(uri, vars=context.vars))
    context.vars[resp_var] = response.json()


@then("I poll and finalize the ACME order {var_path} as {finalized_var}")
def step_impl(context: Context, var_path: str, finalized_var: str):
    order = eval_var(context, var_path, as_json=False)
    acme_client = context.acme_client
    try:
        finalized_order = acme_client.poll_and_finalize(order)
        context.vars[finalized_var] = finalized_order
    except Exception as exp:
        logger.error(f"Failed to finalize order: {exp}", exc_info=True)
        context.vars["error"] = exp


@then("I parse the full-chain certificate from order {order_var_path} as {cert_var}")
def step_impl(context: Context, order_var_path: str, cert_var: str):
    order = eval_var(context, order_var_path, as_json=False)
    cert = x509.load_pem_x509_certificate(order.fullchain_pem.encode())
    context.vars[cert_var] = cert
