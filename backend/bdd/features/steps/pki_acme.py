from behave.runner import Context

from behave import given
from behave import when
from behave import then


class PkiProject:
    def __init__(self, id: str):
        self.id = id


@given('I have a PKI project as "{project_var}"')
def step_impl(context: Context, project_var: str):
    # TODO: Fixed value for now, just to make test much easier,
    #       we should call infisical API to create such project instead
    #       in the future
    project_id = "c051e74c-48a7-4724-832c-d5b496698546"
    context.vars[project_var] = PkiProject(project_id)


@when('I send a {method} request to "{url}"')
def step_impl(context: Context, method: str, url: str):
    context.response = context.http_client.request(method, url.format(**context.vars))


@then('the response status code should be "{expected_status_code}"')
def step_impl(context: Context, expected_status_code: int):
    assert context.response.status_code == expected_status_code, (
        f"{context.response.status_code} != {expected_status_code}"
    )


@then('the response header "{header}" should contains non-empty value')
def step_impl(context: Context, header: str):
    header_value = context.response.headers.get(header)
    print(context.response.headers)
    assert header_value is not None, f"Header {header} not found in response"
    assert header_value, (
        f"Header {header} found in response, but value {header_value:!r} is empty"
    )
