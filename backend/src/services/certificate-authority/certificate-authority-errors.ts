import { BadRequestError, NotFoundError } from "@app/lib/errors";
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
    message: `App connection with ID '${appConnectionId}' not found in this organization. List the ${APP_CONNECTION_NAME_MAP[app]} connections you can use with GET /api/v1/app-connections/${app}/available to find the right ID.`
  });

// The AWS SDK's default credential chain throws this, with no AWS response metadata, when it cannot load the
// instance's own AWS credentials: none are configured, or a configured source (an SSO session, an instance role) failed.
export const isAwsInstanceCredentialsMissing = (error: unknown) =>
  error instanceof Error && error.name === "CredentialsProviderError";

export const awsInstanceCredentialsMissingError = (connectionLabel: string) =>
  new BadRequestError({
    message: `Infisical could not load its own AWS credentials to assume the ${connectionLabel}'s role. Ask your instance administrator to check the AWS credentials Infisical runs with (INF_APP_CONNECTION_AWS_ACCESS_KEY_ID and INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY, or its AWS role or session) and set or refresh them, then try again.`
  });

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
