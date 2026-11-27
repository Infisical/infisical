import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";

import { CaStatus, CaType } from "./certificate-authority-enums";

export const caNotFoundError = (caId: string) =>
  new NotFoundError({
    message: `Certificate authority with ID '${caId}' not found. List your organization's certificate authorities with GET /api/v1/cert-manager/ca to find the right ID.`
  });

export const unsupportedCaTypeError = (type: unknown) =>
  new BadRequestError({
    message: `Certificate authority type '${String(type)}' is not supported. Supported types: ${Object.values(CaType).join(", ")}.`
  });

export const caAppConnectionNotFoundError = (appConnectionId: string, app: AppConnection) =>
  new NotFoundError({
    message: `App connection with ID '${appConnectionId}' not found in this organization. Check the ID of the ${APP_CONNECTION_NAME_MAP[app]} connection under App Connections in Certificate Manager and try again.`
  });

// The AWS SDK's default credential chain throws this, with no AWS response metadata, when it cannot load the
// instance's own AWS credentials: none are configured, or a configured source (an SSO session, an instance role) failed.
export const isAwsInstanceCredentialsMissing = (error: unknown) =>
  error instanceof Error && error.name === "CredentialsProviderError";

export const awsInstanceCredentialsMissingError = (connectionLabel: string) =>
  new BadRequestError({
    message: `Infisical could not load its own AWS credentials to assume the ${connectionLabel}'s role. Ask your instance administrator to check the AWS credentials Infisical runs with (INF_APP_CONNECTION_AWS_ACCESS_KEY_ID and INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY, or its AWS role or session) and set or refresh them, then try again.`
  });

const AWS_THROTTLING_ERROR_NAMES = [
  "Throttling",
  "ThrottlingException",
  "ThrottledException",
  "TooManyRequestsException",
  "RequestLimitExceeded",
  "RequestThrottled",
  "RequestThrottledException",
  "PriorRequestNotComplete"
];

const AWS_TIMEOUT_ERROR_NAMES = ["TimeoutError", "RequestTimeout", "RequestTimeoutException"];

// ENOTFOUND is left out: the host does not exist, which is permanent (a FIPS endpoint in a region that has none, or a
// custom STS endpoint that was removed), so it stays a 400.
const NETWORK_ERROR_CODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN"
];

// Throttling, timeouts, network failures and AWS-side faults are not the caller's configuration to fix, so setup
// checks answer them with a 5xx that a client retries instead of a 400 it reads as its own mistake. The SDK adds an
// empty `$metadata` to every error once its retries run out, network errors included, so these are matched by name
// and code rather than by the presence of an HTTP status.
export const isAwsTransientError = (error: unknown) => {
  if (!(error instanceof Error) || !("$metadata" in error)) return false;
  const { $fault, $metadata, $retryable, code } = error as {
    $fault?: string;
    $metadata?: { httpStatusCode?: number };
    $retryable?: unknown;
    code?: string;
  };
  const httpStatusCode = $metadata?.httpStatusCode ?? 0;
  return (
    $fault === "server" ||
    httpStatusCode >= 500 ||
    httpStatusCode === 429 ||
    $retryable !== undefined ||
    AWS_THROTTLING_ERROR_NAMES.includes(error.name) ||
    AWS_TIMEOUT_ERROR_NAMES.includes(error.name) ||
    (code !== undefined && NETWORK_ERROR_CODES.includes(code))
  );
};

export const awsTransientError = (service: string, error: Error) => {
  const { code } = error as { code?: string };
  if (code && NETWORK_ERROR_CODES.includes(code)) {
    return new InternalServerError({
      message: `Infisical could not reach ${service} (${code}). This is usually temporary. Try again shortly, and if it keeps failing, ask your instance administrator to check that Infisical can reach AWS, and the connection's STS endpoint if it sets one.`
    });
  }
  return new InternalServerError({
    message: `${service} did not answer Infisical's check (${error.name}). This is a temporary problem on AWS's side, not your configuration. Try again shortly.`
  });
};

export const duplicateCaNameError = (name: string) =>
  new BadRequestError({
    message: `A certificate authority named '${name}' already exists in this organization. Choose a different name.`
  });

export const externalCaNotSavedError = (name: string) =>
  new BadRequestError({
    message: `Certificate authority '${name}' was saved without its external configuration. Delete it and create it again.`
  });

export const caTypeMismatchError = (caId: string, type: CaType) =>
  new NotFoundError({
    message: `Certificate authority with ID '${caId}' is not ${type === CaType.INTERNAL ? "an internal certificate authority" : `a certificate authority of type '${type}'`}. List your organization's certificate authorities with GET /api/v1/cert-manager/ca to find the right ID.`
  });

export const caNotActiveError = (caName: string, status: string) =>
  new BadRequestError({
    message:
      status === CaStatus.PENDING_CERTIFICATE
        ? `Certificate authority '${caName}' is pending-certificate. Generate its CA certificate (a root CA) or install a signed one (an intermediate CA) before issuing certificates.`
        : `Certificate authority '${caName}' is ${status}. Set it to active before issuing certificates.`
  });

export const caCertNotInstalledError = (caName: string) =>
  new BadRequestError({
    message: `Certificate authority '${caName}' has no CA certificate installed. Generate its CA certificate (a root CA) or install a signed one (an intermediate CA) before issuing.`
  });

export const caExpiredError = (caName: string, notAfter: Date | string) =>
  new BadRequestError({
    message: `Certificate authority '${caName}' expired on ${new Date(notAfter).toISOString()}. Renew the CA before issuing.`
  });

export const notBeforeBeforeCaError = (notBefore: Date, caNotBefore: Date) =>
  new BadRequestError({
    message: `notBefore (${notBefore.toISOString()}) is before the CA certificate's notBefore (${caNotBefore.toISOString()}). Choose a notBefore on or after it.`
  });

export const certNotAfterAfterCaError = (notAfter: Date, caNotAfter: Date) =>
  new BadRequestError({
    message: `The certificate would expire on ${notAfter.toISOString()}, after its CA certificate expires on ${caNotAfter.toISOString()}. Request a shorter TTL or an earlier notAfter.`
  });

export const invalidAltNameError = (altName: string) =>
  new BadRequestError({ message: `Alt name '${altName}' is not a valid DNS name, IP address, email address or URI.` });
