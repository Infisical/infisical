import json
import logging
import os
import re
import threading

import httpx
import jq
import requests
import glom
from faker import Faker
from acme import client
from acme import messages
from acme import standalone
from behave.runner import Context
from behave import given
from behave import when
from behave import then
from josepy.jwk import JWKRSA
from josepy import JSONObjectWithFields
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes

ACC_KEY_BITS = 2048
ACC_KEY_PUBLIC_EXPONENT = 65537
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
        elif isinstance(value, httpx.Response):
            value = value.json()
    return value


def prepare_headers(context: Context) -> dict | None:
    headers = {}
    auth_token = getattr(context, "auth_token", None)
    if auth_token is not None:
        headers["authorization"] = "Bearer {}".format(auth_token)
    if not headers:
        return None
    return headers


@given("I make a random {faker_type} as {var_name}")
def step_impl(context: Context, faker_type: str, var_name: str):
    context.vars[var_name] = getattr(faker, faker_type)()


@given('I have an ACME cert profile as "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    # TODO: Fixed value for now, just to make test much easier,
    #       we should call infisical API to create such profile instead
    #       in the future
    profile_id = os.getenv("PROFILE_ID")
    kid = profile_id
    secret = os.getenv("EAB_SECRET")
    context.vars[profile_var] = AcmeProfile(
        profile_id,
        eab_kid=kid,
        eab_secret=secret,
    )


@given("I use {token_var} for authentication")
def step_impl(context: Context, token_var: str):
    context.auth_token = eval_var(context, token_var)


@when('I send a {method} request to "{url}"')
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


@when('I send a {method} request to "{url}" with JSON payload')
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


@then(
    'I register a new ACME account with email {email} and EAB key id "{kid}" with secret "{secret}" as {account_var}'
)
def step_impl(context: Context, email: str, kid: str, secret: str, account_var: str):
    acme_client = context.acme_client
    account_public_key = acme_client.net.key.public_key()
    eab = messages.ExternalAccountBinding.from_data(
        account_public_key=account_public_key,
        kid=replace_vars(kid, context.vars),
        hmac_key=replace_vars(secret, context.vars),
        directory=acme_client.directory,
        hmac_alg="HS256",
    )
    registration = messages.NewRegistration.from_data(
        email=email,
        external_account_binding=eab,
    )
    context.vars[account_var] = acme_client.new_account(registration)


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


@then("I create a RSA private key pair as {rsa_key_var}")
def step_impl(context: Context, rsa_key_var: str):
    context.vars[rsa_key_var] = rsa.generate_private_key(
        # TODO: make them configurable if we need to
        public_exponent=65537,
        key_size=2048,
    )


@then(
    "I sign the certificate signing request {csr_var} with private key {pk_var} and output it as {pem_var} in PEM format"
)
def step_impl(context: Context, csr_var: str, pk_var: str, pem_var: str):
    context.vars[pem_var] = (
        context.vars[csr_var]
        .sign(context.vars[pk_var], hashes.SHA256())
        .public_bytes(serialization.Encoding.PEM)
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
    value, result = apply_value_with_jq(
        context=context,
        var_path=var_path,
        jq_query=jq_query,
    )
    assert re.match(replace_vars(regex, context.vars), result), (
        f"{json.dumps(value)!r} with jq {jq_query!r}, the result {json.dumps(result)!r} does not match {regex!r}"
    )


@then("the value {var_path} should be equal to json")
def step_impl(context: Context, var_path: str):
    value = eval_var(context, var_path)
    expected_value = json.loads(context.text)
    assert value == expected_value, f"{value!r} does not match {expected_value!r}"


@then("the value {var_path} should be equal to {expected}")
def step_impl(context: Context, var_path: str, expected: str):
    value = eval_var(context, var_path)
    expected_value = json.loads(expected)
    assert value == expected_value, f"{value!r} does not match {expected_value!r}"


@then('I memorize {var_path} with jq "{jq_query}" as {var_name}')
def step_impl(context: Context, var_path: str, jq_query, var_name: str):
    _, value = apply_value_with_jq(
        context=context,
        var_path=var_path,
        jq_query=jq_query,
    )
    context.vars[var_name] = value


@then("I memorize {var_path} as {var_name}")
def step_impl(context: Context, var_path: str, var_name: str):
    value = eval_var(context, var_path)
    context.vars[var_name] = value


@then("I print the value {var_path}")
def step_impl(context: Context, var_path: str):
    value = eval_var(context, var_path)
    print(json.dumps(value.json(), indent=2))


@then(
    "I select challenge with type {challenge_type} for domain {domain} from order at {var_path} as {challenge_var}"
)
def step_impl(
    context: Context,
    challenge_type: str,
    domain: str,
    var_path: str,
    challenge_var: str,
):
    order = eval_var(context, var_path, as_json=False)
    if not isinstance(order, messages.OrderResource):
        raise ValueError(
            f"Expected OrderResource but got {type(order)!r} at {var_path!r}"
        )
    auths = list(
        filter(lambda o: o.body.identifier.value == domain, order.authorizations)
    )
    if not auths:
        raise ValueError(
            f"Authorization for domain {domain!r} not found in {var_path!r}"
        )
    if len(auths) > 1:
        raise ValueError(
            f"More than one order for domain {domain!r} found in {var_path!r}"
        )
    auth = auths[0]

    challenges = list(filter(lambda a: a.typ == challenge_type, auth.body.challenges))
    if not challenges:
        raise ValueError(
            f"Authorization type {challenge_type!r} not found in {var_path!r}"
        )
    if len(challenges) > 1:
        raise ValueError(
            f"More than one authorization for type {challenge_type!r} found in {var_path!r}"
        )
    context.vars[challenge_var] = challenges[0]


@then("I serve challenge response for {var_path} at {hostname}")
def step_impl(context: Context, var_path: str, hostname: str):
    if hostname != "localhost":
        raise ValueError("Currently only localhost is supported")
    challenge = eval_var(context, var_path, as_json=False)
    response, validation = challenge.response_and_validation(
        context.acme_client.net.key
    )
    resource = standalone.HTTP01RequestHandler.HTTP01Resource(
        chall=challenge.chall, response=response, validation=validation
    )
    # TODO: make port configurable
    servers = standalone.HTTP01DualNetworkedServers(("0.0.0.0", 8087), {resource})
    # Start client standalone web server.
    web_server = threading.Thread(name="web_server", target=servers.serve_forever)
    web_server.daemon = True
    web_server.start()
    context.web_server = web_server


@then("I tell ACME server that {var_path} is ready to be verified")
def step_impl(context: Context, var_path: str):
    challenge = eval_var(context, var_path, as_json=False)
    acme_client = context.acme_client
    response, validation = challenge.response_and_validation(acme_client.net.key)
    acme_client.answer_challenge(challenge, response)


@then("I poll and finalize the ACME order {var_path} as {finalized_var}")
def step_impl(context: Context, var_path: str, finalized_var: str):
    order = eval_var(context, var_path, as_json=False)
    acme_client = context.acme_client
    finalized_order = acme_client.poll_and_finalize(order)
    context.vars[finalized_var] = finalized_order
