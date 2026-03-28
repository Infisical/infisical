import json
import logging
import os
import subprocess
import tempfile

from behave import given
from behave import when
from behave import then
from behave.runner import Context
from cryptography import x509
from faker import Faker

from utils import replace_vars

logger = logging.getLogger(__name__)
faker = Faker()

RSA_KEY_SIZE = 2048
_enroll_counter = 0


def _next_enroll_name() -> str:
    global _enroll_counter
    _enroll_counter += 1
    return f"enroll-{_enroll_counter}"


class ScepProfile:
    def __init__(self, profile_id: str, challenge_password: str):
        self.id = profile_id
        self.challenge_password = challenge_password


class SscepHelper:
    def __init__(self, base_url: str, profile_id: str, work_dir: str):
        self.scep_url = f"{base_url}/scep/{profile_id}/pkiclient.exe"
        self.work_dir = work_dir
        self.ca_cert_prefix = os.path.join(work_dir, "ca.pem")

    def _run(self, cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
        logger.debug("Running command: %s", " ".join(cmd))
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )
        logger.debug("stdout: %s", result.stdout)
        logger.debug("stderr: %s", result.stderr)
        if check and result.returncode != 0:
            raise RuntimeError(
                f"Command failed (exit {result.returncode}): {' '.join(cmd)}\n"
                f"stdout: {result.stdout}\nstderr: {result.stderr}"
            )
        return result

    def getcaps(self) -> str:
        result = self._run(["sscep", "getcaps", "-u", self.scep_url])
        return result.stdout

    def getca(self) -> list[x509.Certificate]:
        self._run([
            "sscep", "getca",
            "-u", self.scep_url,
            "-c", self.ca_cert_prefix,
        ])
        certs = []
        for i in range(10):
            cert_path = f"{self.ca_cert_prefix}-{i}"
            if not os.path.exists(cert_path):
                break
            with open(cert_path, "rb") as f:
                cert_data = f.read()
            try:
                cert = x509.load_pem_x509_certificate(cert_data)
            except Exception:
                cert = x509.load_der_x509_certificate(cert_data)
            certs.append(cert)
        return certs

    def generate_key(self, name: str = "device") -> str:
        key_path = os.path.join(self.work_dir, f"{name}.key")
        self._run([
            "openssl", "genrsa",
            "-out", key_path,
            str(RSA_KEY_SIZE),
        ])
        return key_path

    def generate_csr(
        self,
        key_path: str,
        cn: str,
        challenge_password: str | None = None,
        name: str = "device",
    ) -> str:
        csr_path = os.path.join(self.work_dir, f"{name}.csr")
        conf_path = os.path.join(self.work_dir, f"{name}-csr.cnf")

        conf_lines = [
            "[req]",
            "prompt = no",
            "distinguished_name = dn",
        ]
        if challenge_password is not None:
            conf_lines.append("attributes = req_attributes")

        conf_lines.extend([
            "",
            "[dn]",
            f"CN = {cn}",
        ])

        if challenge_password is not None:
            conf_lines.extend([
                "",
                "[req_attributes]",
                f"challengePassword = {challenge_password}",
            ])

        with open(conf_path, "w") as f:
            f.write("\n".join(conf_lines) + "\n")

        self._run([
            "openssl", "req", "-new",
            "-key", key_path,
            "-out", csr_path,
            "-config", conf_path,
        ])
        return csr_path

    def enroll(
        self,
        key_path: str,
        csr_path: str,
        name: str = "device",
        check: bool = True,
    ) -> tuple[subprocess.CompletedProcess, str]:
        cert_path = os.path.join(self.work_dir, f"{name}.crt")
        ra_cert = f"{self.ca_cert_prefix}-0"

        result = self._run(
            [
                "sscep", "enroll",
                "-u", self.scep_url,
                "-c", ra_cert,
                "-k", key_path,
                "-r", csr_path,
                "-l", cert_path,
                "-E", "aes256",
                "-S", "sha256",
                "-v",
            ],
            check=check,
        )
        return result, cert_path

    def renew(
        self,
        old_key_path: str,
        old_cert_path: str,
        new_key_path: str,
        new_csr_path: str,
        name: str = "renewed",
        check: bool = True,
    ) -> tuple[subprocess.CompletedProcess, str]:
        cert_path = os.path.join(self.work_dir, f"{name}.crt")
        ra_cert = f"{self.ca_cert_prefix}-0"

        result = self._run(
            [
                "sscep", "enroll",
                "-u", self.scep_url,
                "-c", ra_cert,
                "-K", old_key_path,
                "-O", old_cert_path,
                "-k", new_key_path,
                "-r", new_csr_path,
                "-l", cert_path,
                "-E", "aes256",
                "-S", "sha256",
                "-v",
            ],
            check=check,
        )
        return result, cert_path


def _create_scep_profile(
    context: Context,
    challenge_password: str,
    include_ca_cert: bool = True,
    allow_renewal: bool = True,
) -> ScepProfile:
    jwt_token = context.vars["AUTH_TOKEN"]
    profile_slug = faker.slug()

    response = context.http_client.post(
        "/api/v1/cert-manager/certificate-profiles",
        headers={"authorization": f"Bearer {jwt_token}"},
        json={
            "projectId": context.vars["PROJECT_ID"],
            "slug": profile_slug,
            "description": "SCEP Profile created by BDD test",
            "enrollmentType": "scep",
            "caId": context.vars["CERT_CA_ID"],
            "certificatePolicyId": context.vars["CERT_POLICY_ID"],
            "scepConfig": {
                "challengePassword": challenge_password,
                "includeCaCertInResponse": include_ca_cert,
                "allowCertBasedRenewal": allow_renewal,
            },
        },
    )
    response.raise_for_status()
    resp_json = response.json()
    profile_id = resp_json["certificateProfile"]["id"]

    return ScepProfile(profile_id, challenge_password)


def _get_sscep_helper(context: Context, profile_var: str) -> SscepHelper:
    profile: ScepProfile = context.vars[profile_var]
    helper_key = f"_sscep_{profile_var}"

    if helper_key not in context.vars:
        work_dir = tempfile.mkdtemp(prefix="scep_bdd_")
        context.vars[helper_key] = SscepHelper(
            base_url=context.vars["BASE_URL"],
            profile_id=profile.id,
            work_dir=work_dir,
        )
        if not hasattr(context, "_scep_work_dirs"):
            context._scep_work_dirs = []
        context._scep_work_dirs.append(work_dir)

    return context.vars[helper_key]


@given('I have a SCEP cert profile with challenge password "{password}" as "{profile_var}"')
def step_impl(context: Context, password: str, profile_var: str):
    context.vars[profile_var] = _create_scep_profile(context, challenge_password=password)


@given('I have a SCEP cert profile with config as "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    config = json.loads(context.text)
    context.vars[profile_var] = _create_scep_profile(
        context,
        challenge_password=config["challengePassword"],
        include_ca_cert=config.get("includeCaCertInResponse", True),
        allow_renewal=config.get("allowCertBasedRenewal", True),
    )


@when('I send a SCEP GetCACaps request for profile "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    profile: ScepProfile = context.vars[profile_var]
    url = f"/scep/{profile.id}/pkiclient.exe?operation=GetCACaps"
    response = context.http_client.get(url)
    context.vars["response"] = response
    context.vars["scep_caps_response"] = response.text


@when('I send a SCEP GetCACert request for profile "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    profile: ScepProfile = context.vars[profile_var]
    url = f"/scep/{profile.id}/pkiclient.exe?operation=GetCACert"
    response = context.http_client.get(url)
    context.vars["response"] = response
    context.vars["scep_getcacert_response"] = response


@when('I send a SCEP request with unsupported operation "{operation}" for profile "{profile_var}"')
def step_impl(context: Context, operation: str, profile_var: str):
    profile: ScepProfile = context.vars[profile_var]
    url = f"/scep/{profile.id}/pkiclient.exe?operation={operation}"
    response = context.http_client.get(url)
    context.vars["response"] = response


@when('I fetch the SCEP CA certificates for profile "{profile_var}"')
def step_impl(context: Context, profile_var: str):
    helper = _get_sscep_helper(context, profile_var)
    context.vars["scep_ca_certs"] = helper.getca()


@when('I enroll via SCEP for CN "{cn}" with challenge "{password}" on profile "{profile_var}"')
def step_impl(context: Context, cn: str, password: str, profile_var: str):
    helper = _get_sscep_helper(context, profile_var)

    if not os.path.exists(f"{helper.ca_cert_prefix}-0"):
        context.vars["scep_ca_certs"] = helper.getca()

    name = _next_enroll_name()
    key_path = helper.generate_key(name)
    csr_path = helper.generate_csr(key_path, cn, challenge_password=password, name=name)
    result, cert_path = helper.enroll(key_path, csr_path, name=name, check=False)

    context.vars["scep_enroll_result"] = result
    context.vars["scep_enroll_cert_path"] = cert_path
    context.vars["scep_enroll_key_path"] = key_path
    context.vars["scep_enroll_exit_code"] = result.returncode
    context.vars["scep_enroll_stdout"] = result.stdout
    context.vars["scep_enroll_stderr"] = result.stderr


@when('I enroll via SCEP for CN "{cn}" without challenge password on profile "{profile_var}"')
def step_impl(context: Context, cn: str, profile_var: str):
    helper = _get_sscep_helper(context, profile_var)

    if not os.path.exists(f"{helper.ca_cert_prefix}-0"):
        context.vars["scep_ca_certs"] = helper.getca()

    name = _next_enroll_name()
    key_path = helper.generate_key(name)
    csr_path = helper.generate_csr(key_path, cn, challenge_password=None, name=name)
    result, cert_path = helper.enroll(key_path, csr_path, name=name, check=False)

    context.vars["scep_enroll_result"] = result
    context.vars["scep_enroll_cert_path"] = cert_path
    context.vars["scep_enroll_key_path"] = key_path
    context.vars["scep_enroll_exit_code"] = result.returncode
    context.vars["scep_enroll_stdout"] = result.stdout
    context.vars["scep_enroll_stderr"] = result.stderr


@when('I renew via SCEP for CN "{cn}" on profile "{profile_var}" using the previously issued certificate')
def step_impl(context: Context, cn: str, profile_var: str):
    helper = _get_sscep_helper(context, profile_var)

    old_key_path = context.vars["scep_initial_key_path"]
    old_cert_path = context.vars["scep_initial_cert_path"]

    new_key_path = helper.generate_key("renew")
    new_csr_path = helper.generate_csr(new_key_path, cn, challenge_password=None, name="renew")

    result, cert_path = helper.renew(
        old_key_path=old_key_path,
        old_cert_path=old_cert_path,
        new_key_path=new_key_path,
        new_csr_path=new_csr_path,
        name="renewed",
        check=False,
    )

    context.vars["scep_enroll_result"] = result
    context.vars["scep_enroll_cert_path"] = cert_path
    context.vars["scep_enroll_key_path"] = new_key_path
    context.vars["scep_enroll_exit_code"] = result.returncode
    context.vars["scep_enroll_stdout"] = result.stdout
    context.vars["scep_enroll_stderr"] = result.stderr


@given('I perform a successful SCEP enrollment for CN "{cn}" with challenge "{password}" on profile "{profile_var}"')
def step_impl(context: Context, cn: str, password: str, profile_var: str):
    helper = _get_sscep_helper(context, profile_var)

    if not os.path.exists(f"{helper.ca_cert_prefix}-0"):
        context.vars["scep_ca_certs"] = helper.getca()

    key_path = helper.generate_key("initial")
    csr_path = helper.generate_csr(key_path, cn, challenge_password=password, name="initial")
    result, cert_path = helper.enroll(key_path, csr_path, name="initial", check=True)

    assert os.path.exists(cert_path), f"Enrollment cert not created at {cert_path}"

    context.vars["scep_initial_cert_path"] = cert_path
    context.vars["scep_initial_key_path"] = key_path


@then("the SCEP enrollment should succeed")
def step_impl(context: Context):
    exit_code = context.vars["scep_enroll_exit_code"]
    cert_path = context.vars["scep_enroll_cert_path"]
    assert exit_code == 0, (
        f"sscep enroll failed (exit {exit_code})\n"
        f"stdout: {context.vars['scep_enroll_stdout']}\n"
        f"stderr: {context.vars['scep_enroll_stderr']}"
    )
    assert os.path.exists(cert_path), f"Certificate file not created at {cert_path}"


@then("the SCEP enrollment should fail")
def step_impl(context: Context):
    exit_code = context.vars["scep_enroll_exit_code"]
    assert exit_code != 0, (
        f"sscep enroll unexpectedly succeeded (exit 0)\n"
        f"stdout: {context.vars['scep_enroll_stdout']}"
    )


@then('the issued SCEP certificate subject CN should be "{expected_cn}"')
def step_impl(context: Context, expected_cn: str):
    cert_path = context.vars["scep_enroll_cert_path"]
    assert os.path.exists(cert_path), f"No certificate file at {cert_path}"

    with open(cert_path, "rb") as f:
        cert_data = f.read()

    try:
        cert = x509.load_pem_x509_certificate(cert_data)
    except Exception:
        cert = x509.load_der_x509_certificate(cert_data)

    cn_attrs = cert.subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
    assert len(cn_attrs) > 0, "Issued certificate has no CN"
    actual_cn = cn_attrs[0].value
    assert actual_cn == expected_cn, f"Expected CN '{expected_cn}', got '{actual_cn}'"

    context.vars["scep_issued_cert"] = cert


@then("the issued SCEP certificate should be signed by the CA")
def step_impl(context: Context):
    cert = context.vars.get("scep_issued_cert")
    assert cert is not None, "No issued certificate to check"
    ca_certs = context.vars.get("scep_ca_certs", [])
    assert len(ca_certs) >= 2, f"Expected at least 2 certs in CA bundle (RA + CA), got {len(ca_certs)}"
    ca_cert = ca_certs[1]
    assert cert.issuer == ca_cert.subject, (
        f"Certificate issuer {cert.issuer} does not match CA subject {ca_cert.subject}"
    )


@then("the SCEP CA certificate bundle should contain at least {count:d} certificate(s)")
def step_impl(context: Context, count: int):
    certs = context.vars["scep_ca_certs"]
    assert len(certs) >= count, f"Expected at least {count} certs, got {len(certs)}"


@then("the SCEP CA certificate bundle should contain exactly {count:d} certificate(s)")
def step_impl(context: Context, count: int):
    certs = context.vars["scep_ca_certs"]
    assert len(certs) == count, f"Expected exactly {count} certs, got {len(certs)}"


@then("the first certificate in the SCEP bundle should have CN containing {expected_cn}")
def step_impl(context: Context, expected_cn: str):
    certs = context.vars["scep_ca_certs"]
    assert len(certs) > 0, "No certificates in bundle"
    cn = certs[0].subject.get_attributes_for_oid(x509.oid.NameOID.COMMON_NAME)
    assert len(cn) > 0, "First certificate has no CN"
    expected = replace_vars(expected_cn, context.vars)
    assert expected in cn[0].value, f"Expected CN containing '{expected}', got '{cn[0].value}'"


@then('the SCEP GetCACaps response should contain "{capability}"')
def step_impl(context: Context, capability: str):
    text = context.vars["scep_caps_response"]
    assert capability in text, f"Capability '{capability}' not found in response: {text}"


@then('the SCEP GetCACaps response should not contain "{capability}"')
def step_impl(context: Context, capability: str):
    text = context.vars["scep_caps_response"]
    assert capability not in text, f"Capability '{capability}' unexpectedly found in: {text}"


@then('the response content type should be "{expected_ct}"')
def step_impl(context: Context, expected_ct: str):
    actual = context.vars["response"].headers.get("content-type", "")
    assert expected_ct in actual, f"Expected content type '{expected_ct}', got '{actual}'"
