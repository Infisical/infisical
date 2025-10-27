import json

from behave.runner import Context
from behave import given
from behave import when
from behave import then


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
    profile_id = "c051e74c-48a7-4724-832c-d5b496698546"
    context.vars[profile_var] = AcmeProfile(profile_id)


@when('I send a {method} request to "{url}"')
def step_impl(context: Context, method: str, url: str):
    context.response = context.http_client.request(method, url.format(**context.vars))


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
