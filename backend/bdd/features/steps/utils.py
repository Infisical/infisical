from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.x509.oid import NameOID
import logging
import re
import contextlib

import httpx
import requests
import requests.structures
import glom
from faker import Faker
from behave.runner import Context
from josepy import JSONObjectWithFields

ACC_KEY_BITS = 2048
ACC_KEY_PUBLIC_EXPONENT = 65537
NOCK_API_PREFIX = "/api/__bdd_nock__"
logger = logging.getLogger(__name__)
faker = Faker()


class AcmeProfile:
    def __init__(self, id: str, eab_kid: str, eab_secret: str):
        self.id = id
        self.eab_kid = eab_kid
        self.eab_secret = eab_secret


def replace_vars(payload: dict | list | int | float | str, vars: dict):
    if isinstance(payload, dict):
        return {
            replace_vars(key, vars): replace_vars(value, vars)
            for key, value in payload.items()
        }
    elif isinstance(payload, list):
        return [replace_vars(item, vars) for item in payload]
    elif isinstance(payload, str):
        return payload.format(**vars)
    else:
        return payload


def parse_glom_path(path_str: str) -> glom.Path:
    """
    Parse a glom path string with 'attr[index]' syntax into a Path object.

    Examples:
    >>> parse_glom_path('authorizations[0]') == Path('authorizations', 0)
    True
    >>> parse_glom_path('data.items[1].name') == Path('data', 'items', 1, 'name')
    True
    >>> parse_glom_path('user.addresses[0].street') == Path('user', 'addresses', 0, 'street')
    True
    """
    parts = []

    # Split by dots, but preserve bracketed content
    tokens = re.split(r"(?<!\[)\.(?![^\[]*\])", path_str)

    for token in tokens:
        token = token.strip()
        if not token:
            continue

        # Check for attr[index] pattern
        match = re.match(r"^(.+?)\[([^\]]+)\]$", token)
        if match:
            attr_name = match.group(1).strip()
            index_str = match.group(2).strip()

            # Parse index (support integers, slices, etc.)
            if index_str.isdigit():
                index = int(index_str)
            elif "-" in index_str:
                # Handle negative indices like [-1]
                index = int(index_str)
            elif ":" in index_str:
                # Handle slices like [0:10]
                index = slice(
                    *map(int, [x.strip() for x in index_str.split(":") if x.strip()])
                )
            else:
                # Treat as string key
                index = index_str

            parts.extend([attr_name, index])
        else:
            # Plain attribute/key
            parts.append(token)

    return glom.Path(*parts)


def eval_var(context: Context, var_path: str, as_json: bool = True):
    parts = var_path.split(".", 1)
    value = context.vars[parts[0]]
    if len(parts) == 2:
        value = glom.glom(value, parse_glom_path(parts[1]))
    if as_json:
        if isinstance(value, JSONObjectWithFields):
            value = value.to_json()
        elif isinstance(value, requests.Response):
            value = value.json()
        elif isinstance(value, requests.structures.CaseInsensitiveDict):
            value = dict(value.lower_items())
        elif isinstance(value, httpx.Response):
            value = value.json()
        elif isinstance(value, x509.Certificate):
            value = x509_cert_to_dict(value)
    return value


def prepare_headers(context: Context) -> dict | None:
    headers = {}
    auth_token = getattr(context, "auth_token", None)
    if auth_token is not None:
        headers["authorization"] = "Bearer {}".format(auth_token)
    if not headers:
        return None
    return headers


def x509_cert_to_dict(cert: x509.Certificate) -> dict:
    """
    Convert a cryptography.x509.Certificate to a JSON-serializable nested dict
    with human-readable keys.
    """

    def oid_to_name(oid):
        # Map known OIDs to human-readable names
        mapping = {
            NameOID.COMMON_NAME: "common_name",
            NameOID.ORGANIZATION_NAME: "organization",
            NameOID.ORGANIZATIONAL_UNIT_NAME: "organizational_unit",
            NameOID.COUNTRY_NAME: "country",
            NameOID.LOCALITY_NAME: "locality",
            NameOID.STATE_OR_PROVINCE_NAME: "state_or_province",
            NameOID.EMAIL_ADDRESS: "email_address",
            NameOID.SERIAL_NUMBER: "serial_number",
            NameOID.SURNAME: "surname",
            NameOID.GIVEN_NAME: "given_name",
            NameOID.TITLE: "title",
            NameOID.JURISDICTION_COUNTRY_NAME: "jurisdiction_country",
            NameOID.JURISDICTION_STATE_OR_PROVINCE_NAME: "jurisdiction_state",
            NameOID.JURISDICTION_LOCALITY_NAME: "jurisdiction_locality",
            NameOID.BUSINESS_CATEGORY: "business_category",
            NameOID.POSTAL_CODE: "postal_code",
            NameOID.STREET_ADDRESS: "street_address",
            NameOID.DOMAIN_COMPONENT: "domain_component",
            NameOID.USER_ID: "user_id",
            # Add more as needed
        }
        return mapping.get(oid, oid.dotted_string)

    def name_to_dict(name: x509.Name) -> dict:
        return {oid_to_name(attr.oid): attr.value for attr in name}

    def dns_to_dict(dns: x509.DNSName) -> dict:
        return dict(value=dns.value)

    def extension_to_dict(ext):
        if isinstance(ext.value, x509.SubjectAlternativeName):
            return {
                "critical": ext.critical,
                "general_names": [dns_to_dict(gn) for gn in ext.value],
            }
        elif isinstance(ext.value, x509.BasicConstraints):
            return {
                "critical": ext.critical,
                "ca": ext.value.ca,
                "path_length": ext.value.path_length,
            }
        elif isinstance(ext.value, x509.KeyUsage):
            return {
                "critical": ext.critical,
                **{
                    field.lower(): getattr(ext.value, field)
                    for field in [
                        "digital_signature",
                        "content_commitment",
                        "key_encipherment",
                        "data_encipherment",
                        "key_agreement",
                        "key_cert_sign",
                        "crl_sign",
                        # TODO: deal with error: "ValueError: encipher_only is undefined unless key_agreement is true"
                        # "encipher_only",
                        # "decipher_only",
                    ]
                    if getattr(ext.value, field) is not None
                },
            }
        elif isinstance(ext.value, x509.ExtendedKeyUsage):
            return {
                "critical": ext.critical,
                "usages": [eku.dotted_string for eku in ext.value],
            }
        elif isinstance(ext.value, x509.CRLDistributionPoints):
            return {
                "critical": ext.critical,
                "distribution_points": [
                    {
                        "full_name": [str(uri) for uri in dp.full_name]
                        if dp.full_name
                        else None,
                        "crl_issuer": [str(issuer) for issuer in dp.crl_issuer]
                        if dp.crl_issuer
                        else None,
                        "reasons": [r.name for r in dp.reasons] if dp.reasons else None,
                    }
                    for dp in ext.value
                ],
            }
        elif isinstance(ext.value, x509.AuthorityKeyIdentifier):
            return {
                "critical": ext.critical,
                "key_identifier": ext.value.key_identifier.hex()
                if ext.value.key_identifier
                else None,
                "authority_cert_issuer": [
                    str(n) for n in ext.value.authority_cert_issuer
                ]
                if ext.value.authority_cert_issuer
                else None,
                "authority_cert_serial_number": ext.value.authority_cert_serial_number,
            }
        elif isinstance(ext.value, x509.SubjectKeyIdentifier):
            return {"critical": ext.critical, "digest": ext.value.digest.hex()}
        else:
            return {
                "critical": ext.critical,
                "oid": ext.oid.dotted_string,
                "value": str(ext.value),
            }

    # Build the main dict
    result = dict(
        version=cert.version.name,
        serial_number=cert.serial_number,
        signature_algorithm=cert.signature_algorithm_oid._name,
        issuer=name_to_dict(cert.issuer),
        subject=name_to_dict(cert.subject),
        validity={
            "not_valid_before": cert.not_valid_before.isoformat(),
            "not_valid_after": cert.not_valid_after.isoformat(),
        },
        public_key={
            "key_size": cert.public_key().key_size,
        },
        extensions={
            ext.oid._name
            if hasattr(ext.oid, "_name") and ext.oid._name
            else ext.oid.dotted_string: extension_to_dict(ext)
            for ext in cert.extensions
        },
        fingerprint={
            "sha1": cert.fingerprint(hashes.SHA1()).hex(),
            "sha256": cert.fingerprint(hashes.SHA256()).hex(),
        },
    )

    return result


def define_nock(context: Context, definitions: list[dict]):
    jwt_token = context.vars["AUTH_TOKEN"]
    response = context.http_client.post(
        f"{NOCK_API_PREFIX}/define",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
        json=dict(definitions=definitions),
    )
    response.raise_for_status()


def restore_nock(context: Context):
    jwt_token = context.vars["AUTH_TOKEN"]
    response = context.http_client.post(
        f"{NOCK_API_PREFIX}/restore",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
        json=dict(),
    )
    response.raise_for_status()


def clean_all_nock(context: Context):
    jwt_token = context.vars["AUTH_TOKEN"]
    response = context.http_client.post(
        f"{NOCK_API_PREFIX}/clean-all",
        headers=dict(authorization="Bearer {}".format(jwt_token)),
        json=dict(),
    )
    response.raise_for_status()


@contextlib.contextmanager
def with_nocks(context: Context, definitions: list[dict]):
    try:
        define_nock(context, definitions)
        yield
    finally:
        clean_all_nock(context)
        restore_nock(context)
