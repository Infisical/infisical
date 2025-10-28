import json

from acme import client
from acme import messages
from behave.runner import Context
from behave import given
from behave import when
from behave import then
from josepy.jwk import JWKRSA
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ACC_KEY_BITS = 2048
ACC_KEY_PUBLIC_EXPONENT = 65537


class AcmeProfile:
    def __init__(self, id: str):
        self.id = id


def replace_vars(payload: dict, vars: dict):
    for key, value in payload.items():
        if isinstance(value, dict):
            replace_vars(value, vars)
        elif isinstance(value, list):
            payload[key] = [replace_vars(item, vars) for item in value]
        elif isinstance(value, str):
            payload[key] = value.format(**vars)
        else:
            payload[key] = value


@given('I have an ACME cert profile as "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    # TODO: Fixed value for now, just to make test much easier,
    #       we should call infisical API to create such profile instead
    #       in the future
    profile_id = "0e96a01b-017e-4660-8b3d-ff26018fe0ce"
    context.vars[profile_var] = AcmeProfile(profile_id)


@when('I send a {method} request to "{url}"')
def step_impl(context: Context, method: str, url: str):
    context.response = context.http_client.request(method, url.format(**context.vars))


@when("I have an ACME client connecting to {url}")
def step_impl(context: Context, url: str):
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


@then('the response status code should be "{expected_status_code:d}"')
def step_impl(context: Context, expected_status_code: int):
    assert context.response.status_code == expected_status_code, (
        f"{context.response.status_code} != {expected_status_code}"
    )


@then('the response header "{header}" should contains non-empty value')
def step_impl(context: Context, header: str):
    header_value = context.response.headers.get(header)
    assert header_value is not None, f"Header {header} not found in response"
    assert header_value, (
        f"Header {header} found in response, but value {header_value:!r} is empty"
    )


@then("the response body should match JSON value")
def step_impl(context: Context):
    payload = context.response.json()
    expected = json.loads(context.text)
    replace_vars(expected, context.vars)
    assert payload == expected, f"{payload} != {expected}"


@then(
    "I register a new ACME account with email {email} and EAB key id {kid} with secret {secret} as {account_var}"
)
def step_impl(context: Context, email: str, kid: str, secret: str, account_var: str):
    # TODO: add EAB info here
    registration = messages.NewRegistration.from_data(email=email)
    context.vars[account_var] = context.acme_client.new_account(registration)
