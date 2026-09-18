import * as x509 from "@peculiar/x509";

import { KeyStorePrefixes } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import {
  discoverScepValidationServiceUri,
  getMicrosoftEntraToken,
  intuneSendFailureNotification,
  intuneSendSuccessNotification,
  intuneValidateScepRequest,
  MicrosoftEntraTokenResource,
  TMicrosoftIntuneConnectionCredentials
} from "@app/services/app-connection/microsoft-intune";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { IScepValidationHandler, TScepValidationHandlerDeps } from "./scep-validation-handler-types";

const INTUNE_FAILURE_HRESULT = -2147467259;

type TIntuneAccess = { serviceUri: string; intuneToken: string; expiresAt: number };

const intuneAccessCache = new Map<string, TIntuneAccess>();
const intuneAccessInFlight = new Map<string, Promise<TIntuneAccess>>();

const intuneAccessTtlSeconds = (access: TIntuneAccess) =>
  Math.max(Math.floor((access.expiresAt - Date.now()) / 1000), 1);

const toThumbprint = async (cert: x509.X509Certificate) => {
  const digest = await cert.getThumbprint("SHA-1");
  return Buffer.from(digest).toString("hex").toUpperCase();
};

export const intuneDelegatedHandler = (deps: TScepValidationHandlerDeps): IScepValidationHandler => {
  const acquireIntuneAccess = async (connectionId: string): Promise<TIntuneAccess> => {
    const connection = await deps.appConnectionDAL.findById(connectionId);
    if (!connection || connection.app !== AppConnection.MicrosoftIntune) {
      throw new BadRequestError({ message: "The configured Microsoft Intune connection could not be found." });
    }

    const cacheKey = KeyStorePrefixes.ScepIntuneAccess(connection.id, connection.updatedAt);
    const connectionKeyPrefix = cacheKey.slice(0, cacheKey.lastIndexOf(":") + 1);
    const cached = intuneAccessCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const inFlight = intuneAccessInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const remember = (access: TIntuneAccess) => {
      for (const key of intuneAccessCache.keys()) {
        if (key !== cacheKey && key.startsWith(connectionKeyPrefix)) intuneAccessCache.delete(key);
      }
      intuneAccessCache.set(cacheKey, access);
    };

    const acquisition = (async (): Promise<TIntuneAccess> => {
      const { encryptor, decryptor } = await deps.kmsService.createCipherPairWithDataKey(
        connection.projectId
          ? { type: KmsDataKey.SecretManager, projectId: connection.projectId }
          : { type: KmsDataKey.Organization, orgId: connection.orgId }
      );

      const cachedCipherText = await deps.keyStore.getItem(cacheKey).catch((err: unknown) => {
        logger.warn({ err }, `Intune access cache read failed [cacheKey=${cacheKey}]`);
        return null;
      });
      if (cachedCipherText) {
        try {
          const shared = JSON.parse(
            decryptor({ cipherTextBlob: Buffer.from(cachedCipherText, "base64") }).toString("utf8")
          ) as TIntuneAccess;
          if (shared.expiresAt > Date.now()) {
            remember(shared);
            return shared;
          }
        } catch (err) {
          logger.warn({ err }, `Intune access cache decrypt failed, re-acquiring [cacheKey=${cacheKey}]`);
        }
      }

      const credentials = (await decryptAppConnectionCredentials({
        orgId: connection.orgId,
        projectId: connection.projectId,
        encryptedCredentials: connection.encryptedCredentials,
        kmsService: deps.kmsService
      })) as TMicrosoftIntuneConnectionCredentials;

      const graphToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Graph);
      const serviceUri = await discoverScepValidationServiceUri(graphToken.accessToken);
      const intuneToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Intune);

      const access: TIntuneAccess = {
        serviceUri,
        intuneToken: intuneToken.accessToken,
        expiresAt: intuneToken.expiresAt
      };

      await deps.keyStore
        .setItemWithExpiry(
          cacheKey,
          intuneAccessTtlSeconds(access),
          encryptor({ plainText: Buffer.from(JSON.stringify(access)) }).cipherTextBlob.toString("base64")
        )
        .catch((err: unknown) => logger.warn({ err }, `Intune access cache write failed [cacheKey=${cacheKey}]`));

      remember(access);
      return access;
    })().finally(() => intuneAccessInFlight.delete(cacheKey));

    intuneAccessInFlight.set(cacheKey, acquisition);
    return acquisition;
  };

  const resolveIntune = async (connectionId?: string | null) => {
    if (!connectionId) {
      throw new BadRequestError({
        message: "SCEP enrollment is configured for Microsoft Intune validation but no connection is selected."
      });
    }

    return acquireIntuneAccess(connectionId);
  };

  return {
    supportsPendingIssuance: false,
    requiresIssuanceNotification: true,
    validateRequest: async (ctx) => {
      const { serviceUri, intuneToken } = await resolveIntune(ctx.validationConnectionId);
      const result = await intuneValidateScepRequest({
        intuneAccessToken: intuneToken,
        serviceUri,
        transactionId: ctx.transactionId,
        certificateRequest: ctx.csrDer.toString("base64")
      });

      return result.allowed ? { allowed: true } : { allowed: false, error: result.errorDescription };
    },

    reportIssued: async (ctx) => {
      const { serviceUri, intuneToken } = await resolveIntune(ctx.validationConnectionId);
      const cert = new x509.X509Certificate(ctx.certificateDer);

      await intuneSendSuccessNotification({
        intuneAccessToken: intuneToken,
        serviceUri,
        notification: {
          transactionId: ctx.transactionId,
          certificateRequest: ctx.csrDer.toString("base64"),
          certificateThumbprint: await toThumbprint(cert),
          certificateSerialNumber: cert.serialNumber,
          certificateExpirationDateUtc: cert.notAfter.toISOString(),
          issuingCertificateAuthority: cert.issuer
        }
      });
    },

    reportFailure: async (ctx) => {
      const { serviceUri, intuneToken } = await resolveIntune(ctx.validationConnectionId);

      await intuneSendFailureNotification({
        intuneAccessToken: intuneToken,
        serviceUri,
        notification: {
          transactionId: ctx.transactionId,
          certificateRequest: ctx.csrDer.toString("base64"),
          hResult: INTUNE_FAILURE_HRESULT,
          errorDescription: ctx.error || "Certificate issuance failed"
        }
      });
    }
  };
};
