import crypto from "node:crypto";

import { isAxiosError } from "axios";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { getDynamicSecretOidcSubject, getOidcIssuerUrl } from "@app/services/oidc-issuer/oidc-issuer-fns";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import {
  DynamicSecretNamespaceSchema,
  NAMESPACE_DEFAULT_FEDERATION_AUDIENCE,
  NamespaceAuthType,
  TDynamicProviderFns,
  TDynamicProviderValidateMetadata
} from "./models";

type TNamespaceProviderInputs = z.infer<typeof DynamicSecretNamespaceSchema>;
type TNamespaceProvisionerTokenInputs = Extract<
  TNamespaceProviderInputs,
  { method: NamespaceAuthType.ProvisionerToken }
>;
type TNamespaceFederationInputs = Extract<TNamespaceProviderInputs, { method: NamespaceAuthType.Federation }>;

type TCreateRevokableTokenResponse = {
  bearerToken?: string;
  token?: { tokenId?: string; expiresAt?: string };
};

type TExchangeOidcTokenResponse = {
  tenant_token?: string;
};

type TExchangeTenantTokenForClientCertResponse = {
  clientCertificatePem?: string;
};

export const NAMESPACE_IAM_ENDPOINT = "https://iam.namespaceapis.com";
export const NAMESPACE_OIDC_EXCHANGE_URL =
  "https://private-api.global.namespaceapis.com/nsl.tenants.TenantsService/ExchangeOIDCToken";

const TOKEN_SERVICE = "namespace.cloud.iam.v1beta.TokenService";
const TENANT_SERVICE = "namespace.cloud.iam.v1beta.TenantService";
const REQUEST_TIMEOUT_MS = 30_000;
const CONNECTION_CHECK_TOKEN_TTL_MS = 2 * 60 * 1000;
const CONNECTION_CHECK_TENANT_TOKEN_DURATION = "60s";
const MAX_TENANT_TOKEN_DURATION_SECONDS = 24 * 60 * 60;
const FEDERATION_TTL_ERROR =
  "Namespace federation can't issue a certificate valid for more than 24 hours. Choose a lease TTL of 24 hours or less.";

const CERTIFICATE_ENTITY_ID_PREFIX = "cert:";

const INGRESS_ACCESS_GRANT = { resourceType: "ingress", resourceId: "*", actions: ["access"] };

const REQUIRED_GRANTS_HINT =
  'The provisioner token needs the grants {"resource_type":"token/revokable","resource_id":"*","actions":["create","revoke"]} and {"resource_type":"ingress","resource_id":"*","actions":["access"]}.';

const FEDERATION_GRANTS_HINT =
  'Check that the tenant\'s trust relationship for this dynamic secret grants {"resource_type":"ingress","resource_id":"*","actions":["access"]}.';

export const getNamespaceOidcFederation = (inputs: unknown, { id, orgId }: { id: string; orgId: string }) => {
  const parsed = DynamicSecretNamespaceSchema.safeParse(inputs);
  if (!parsed.success) return null;

  const { SITE_URL } = getConfig();
  return {
    issuerUrl: SITE_URL ? getOidcIssuerUrl(SITE_URL, orgId) : null,
    subject: getDynamicSecretOidcSubject(id),
    audience:
      parsed.data.method === NamespaceAuthType.Federation ? parsed.data.audience : NAMESPACE_DEFAULT_FEDERATION_AUDIENCE
  };
};

type TNamespaceProviderDTO = {
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signDynamicSecretToken">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

type TFederationContext = {
  inputs: TNamespaceFederationInputs;
  dynamicSecret: { id: string; name: string };
  projectId: string;
};

export const NamespaceProvider = ({ oidcIssuerService, projectDAL }: TNamespaceProviderDTO): TDynamicProviderFns => {
  const $parseInputs = (inputs: unknown) => DynamicSecretNamespaceSchema.parseAsync(inputs);

  const $assertFederationTtls = ({ defaultTTL, maxTTL }: { defaultTTL?: string; maxTTL?: string | null }) => {
    const maxMs = MAX_TENANT_TOKEN_DURATION_SECONDS * 1000;
    if ((defaultTTL && ms(defaultTTL) > maxMs) || (maxTTL && ms(maxTTL) > maxMs)) {
      throw new BadRequestError({ message: FEDERATION_TTL_ERROR });
    }
  };

  const validateProviderInputs = async (
    inputs: object,
    { previousInputs, hasActiveLeases, defaultTTL, maxTTL }: TDynamicProviderValidateMetadata
  ) => {
    const providerInputs = await $parseInputs(inputs);
    if (providerInputs.method === NamespaceAuthType.Federation) $assertFederationTtls({ defaultTTL, maxTTL });
    if (!hasActiveLeases || !previousInputs) return providerInputs;

    const previous = await DynamicSecretNamespaceSchema.safeParseAsync(previousInputs);
    if (!previous.success) return providerInputs;

    if (previous.data.method !== providerInputs.method) {
      throw new BadRequestError({
        message:
          "The auth method can't be changed while this dynamic secret has active leases, because they are revoked with the auth method that created them. Revoke the active leases first, then change the auth method."
      });
    }
    if (
      previous.data.method === NamespaceAuthType.ProvisionerToken &&
      providerInputs.method === NamespaceAuthType.ProvisionerToken &&
      previous.data.provisionerToken !== providerInputs.provisionerToken
    ) {
      throw new BadRequestError({
        message:
          "The provisioner token can't be changed while this dynamic secret has active leases, because their tokens are revoked with the current provisioner token. Revoke the active leases first, then change the provisioner token."
      });
    }
    return providerInputs;
  };

  const $call = async <T>(
    method: string,
    bearerToken: string,
    body: Record<string, unknown>,
    { retry = true }: { retry?: boolean } = {}
  ) => {
    const { data } = await request.post<T>(`${NAMESPACE_IAM_ENDPOINT}/${method}`, body, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1"
      },
      timeout: REQUEST_TIMEOUT_MS,
      ...(!retry && { "axios-retry": { retries: 0 } })
    });
    return data;
  };

  const $getConnectError = (err: unknown) =>
    isAxiosError<{ code?: unknown; message?: unknown }>(err) && typeof err.response?.data?.code === "string"
      ? { code: err.response.data.code, message: err.response.data.message }
      : undefined;

  const $toBadRequest = (
    err: unknown,
    prefix: string,
    hints: { permissionDenied: string; unauthenticated: string },
    secrets: (string | undefined)[]
  ) => {
    if (err instanceof BadRequestError) return err;

    const connectError = $getConnectError(err);
    let message = (err as Error)?.message || "Unknown error";
    if (connectError) {
      message = typeof connectError.message === "string" ? connectError.message : connectError.code;
      if (connectError.code === "permission_denied") message = `${message}. ${hints.permissionDenied}`;
      if (connectError.code === "unauthenticated") message = `${message}. ${hints.unauthenticated}`;
    }

    // sanitizeString only matches whole \w+ words, and Namespace tokens and JWTs contain other characters
    const redacted = secrets.reduce<string>(
      (acc, secret) => (secret ? acc.replaceAll(secret, "[REDACTED]") : acc),
      message
    );
    return new BadRequestError({ message: `${prefix}: ${redacted}` });
  };

  const PROVISIONER_TOKEN_HINTS = {
    permissionDenied: REQUIRED_GRANTS_HINT,
    unauthenticated: "Check that the provisioner token is valid and has not expired or been revoked."
  };

  // the org comes from the dynamic secret's project, never the inputs, so only its own org's issuer signs for it
  const $getOrgId = async (projectId: string) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    return project.orgId;
  };

  const $exchangeForTenantToken = async (
    { inputs, dynamicSecret, projectId }: TFederationContext,
    getDuration: () => string,
    prefix: string
  ) => {
    const orgId = await $getOrgId(projectId);
    const oidcToken = await oidcIssuerService.signDynamicSecretToken({
      dynamicSecret,
      orgId,
      projectId,
      audience: inputs.audience
    });
    const duration = getDuration();

    const { SITE_URL } = getConfig();
    const hints = {
      permissionDenied: FEDERATION_GRANTS_HINT,
      unauthenticated: `Check that the Namespace tenant ${inputs.tenantId} has a trust relationship with issuer ${SITE_URL ? getOidcIssuerUrl(SITE_URL, orgId) : "<SITE_URL is not set>"}, subject ${getDynamicSecretOidcSubject(dynamicSecret.id)}, and audience ${inputs.audience}, created with nsc auth trust-relationships add.`
    };

    try {
      const { data } = await request.post<TExchangeOidcTokenResponse>(
        NAMESPACE_OIDC_EXCHANGE_URL,
        { tenant_id: inputs.tenantId, oidc_token: oidcToken, duration },
        // a retry could outlast the lock an Agent Vault service holds while leasing
        { headers: { "Content-Type": "application/json" }, timeout: REQUEST_TIMEOUT_MS, "axios-retry": { retries: 0 } }
      );
      if (!data.tenant_token) {
        throw new BadRequestError({
          message: `${prefix}: Namespace returned an OIDC token exchange response without a tenant token`
        });
      }
      return { tenantToken: data.tenant_token, oidcToken, hints };
    } catch (err) {
      throw $toBadRequest(err, prefix, hints, [oidcToken]);
    }
  };

  const $createChildToken = async (
    providerInputs: TNamespaceProvisionerTokenInputs,
    name: string,
    expireAt: number
  ) => {
    const data = await $call<TCreateRevokableTokenResponse>(
      `${TOKEN_SERVICE}/CreateRevokableToken`,
      providerInputs.provisionerToken,
      {
        name,
        description: "Issued by an Infisical dynamic secret lease",
        expiresAt: new Date(expireAt).toISOString(),
        access: { grants: [INGRESS_ACCESS_GRANT] }
      },
      // a retried create can make a second token whose ID we never see, so nothing would revoke it
      { retry: false }
    );
    if (!data.bearerToken || !data.token?.tokenId) {
      throw new BadRequestError({ message: "Namespace returned a token response without a bearer token or token ID" });
    }
    return { bearerToken: data.bearerToken, tokenId: data.token.tokenId };
  };

  const $revokeChildToken = async (providerInputs: TNamespaceProvisionerTokenInputs, tokenId: string) => {
    try {
      await $call(`${TOKEN_SERVICE}/RevokeRevokableToken`, providerInputs.provisionerToken, { tokenId });
    } catch (err) {
      // already gone in Namespace, so the lease can still be closed
      if ($getConnectError(err)?.code === "not_found" || (isAxiosError(err) && err.response?.status === 404)) return;
      throw err;
    }
  };

  const $issueClientCertificate = async (bearerToken: string) => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

    const { clientCertificatePem } = await $call<TExchangeTenantTokenForClientCertResponse>(
      `${TENANT_SERVICE}/ExchangeTenantTokenForClientCert`,
      bearerToken,
      { publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) },
      { retry: false }
    );
    if (!clientCertificatePem) {
      throw new BadRequestError({ message: "Namespace returned no client certificate" });
    }

    // the ingress refuses the leaf without its intermediate, so the whole PEM is returned
    const leaf = new crypto.X509Certificate(clientCertificatePem);
    if (!leaf.checkPrivateKey(privateKey)) {
      throw new BadRequestError({ message: "Namespace returned a client certificate for a different key" });
    }

    return {
      leaf,
      data: {
        CLIENT_CERTIFICATE: clientCertificatePem,
        PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
        EXPIRES_AT: new Date(leaf.validTo).toISOString()
      }
    };
  };

  const validateConnection = async (
    inputs: unknown,
    { projectId, defaultTTL, maxTTL, dynamicSecret }: Parameters<TDynamicProviderFns["validateConnection"]>[1]
  ) => {
    const providerInputs = await $parseInputs(inputs);

    if (providerInputs.method === NamespaceAuthType.Federation) {
      $assertFederationTtls({ defaultTTL, maxTTL });
      // on create there is no ID yet, so no subject the tenant could trust
      if (!dynamicSecret) return true;

      await $exchangeForTenantToken(
        { inputs: providerInputs, dynamicSecret, projectId },
        () => CONNECTION_CHECK_TENANT_TOKEN_DURATION,
        "Failed to connect with Namespace"
      );
      return true;
    }

    try {
      // creating and revoking a short-lived token proves every grant a lease uses
      const { tokenId } = await $createChildToken(
        providerInputs,
        `infisical-check-${alphaNumericNanoId(12)}`,
        Date.now() + CONNECTION_CHECK_TOKEN_TTL_MS
      );
      await $revokeChildToken(providerInputs, tokenId);
      return true;
    } catch (err) {
      throw $toBadRequest(err, "Failed to connect with Namespace", PROVISIONER_TOKEN_HINTS, [
        providerInputs.provisionerToken
      ]);
    }
  };

  const $createWithFederation = async (context: TFederationContext, expireAt: number) => {
    const getDurationSeconds = () => Math.floor((expireAt - Date.now()) / 1000);
    if (getDurationSeconds() > MAX_TENANT_TOKEN_DURATION_SECONDS) {
      throw new BadRequestError({ message: FEDERATION_TTL_ERROR });
    }

    const prefix = "Failed to create Namespace client certificate";
    // measured after signing, so the certificate doesn't outlive the lease
    const { tenantToken, oidcToken, hints } = await $exchangeForTenantToken(
      context,
      () => {
        const durationSeconds = getDurationSeconds();
        if (durationSeconds < 1) {
          throw new BadRequestError({ message: "The lease expires too soon to issue a Namespace client certificate." });
        }
        return `${durationSeconds}s`;
      },
      prefix
    );
    try {
      const { leaf, data } = await $issueClientCertificate(tenantToken);
      return { entityId: `${CERTIFICATE_ENTITY_ID_PREFIX}${leaf.serialNumber}`, data };
    } catch (err) {
      throw $toBadRequest(err, prefix, hints, [oidcToken, tenantToken]);
    }
  };

  const create = async ({
    inputs,
    expireAt,
    dynamicSecret,
    metadata
  }: Parameters<TDynamicProviderFns["create"]>[0]) => {
    const providerInputs = await $parseInputs(inputs);
    if (providerInputs.method === NamespaceAuthType.Federation) {
      return $createWithFederation({ inputs: providerInputs, dynamicSecret, projectId: metadata.projectId }, expireAt);
    }

    let tokenId: string | undefined;
    let bearerToken: string | undefined;
    try {
      ({ tokenId, bearerToken } = await $createChildToken(
        providerInputs,
        `infisical-${alphaNumericNanoId(12)}`,
        expireAt
      ));
      const { data } = await $issueClientCertificate(bearerToken);
      return { entityId: tokenId, data };
    } catch (err) {
      if (tokenId) {
        // no lease will be saved to revoke the token that was already created
        const leftoverTokenId = tokenId;
        await $revokeChildToken(providerInputs, leftoverTokenId).catch((cleanupErr) =>
          logger.error(
            $toBadRequest(cleanupErr, "Failed to revoke Namespace token", PROVISIONER_TOKEN_HINTS, [
              providerInputs.provisionerToken
            ]),
            `Failed to clean up Namespace token [tokenId=${leftoverTokenId}]`
          )
        );
      }
      throw $toBadRequest(err, "Failed to create Namespace client certificate", PROVISIONER_TOKEN_HINTS, [
        providerInputs.provisionerToken,
        bearerToken
      ]);
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    // a federated lease holds no token, and Namespace can't revoke a certificate before its notAfter
    if (entityId.startsWith(CERTIFICATE_ENTITY_ID_PREFIX)) return { entityId };

    const providerInputs = await $parseInputs(inputs);
    if (providerInputs.method !== NamespaceAuthType.ProvisionerToken) {
      logger.error(
        `Namespace token lease has no provisioner token to revoke it with; closing it [tokenId=${entityId}]`
      );
      return { entityId };
    }

    try {
      await $revokeChildToken(providerInputs, entityId);
    } catch (err) {
      throw $toBadRequest(err, "Failed to revoke Namespace token", PROVISIONER_TOKEN_HINTS, [
        providerInputs.provisionerToken
      ]);
    }
    return { entityId };
  };

  const renew = async () => {
    // the certificate's notAfter is fixed when it is minted and Namespace cannot extend it
    throw new BadRequestError({
      message:
        "Namespace dynamic secret does not support renewal because its client certificate can't be extended. Create a new lease instead."
    });
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
