import * as x509 from "@peculiar/x509";

import { KeyStorePrefixes } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { BadRequestError } from "@app/lib/errors";
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

    const acquisition = withCache<TIntuneAccess>({
      keyStore: deps.keyStore,
      key: cacheKey,
      ttlSeconds: intuneAccessTtlSeconds,
      fetcher: async () => {
        const credentials = (await decryptAppConnectionCredentials({
          orgId: connection.orgId,
          projectId: connection.projectId,
          encryptedCredentials: connection.encryptedCredentials,
          kmsService: deps.kmsService
        })) as TMicrosoftIntuneConnectionCredentials;

        const graphToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Graph);
        const serviceUri = await discoverScepValidationServiceUri(graphToken.accessToken);
        const intuneToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Intune);

        return { serviceUri, intuneToken: intuneToken.accessToken, expiresAt: intuneToken.expiresAt };
      }
    })
      .then((access) => {
        for (const key of intuneAccessCache.keys()) {
          if (key !== cacheKey && key.startsWith(connectionKeyPrefix)) intuneAccessCache.delete(key);
        }
        intuneAccessCache.set(cacheKey, access);
        return access;
      })
      .finally(() => intuneAccessInFlight.delete(cacheKey));

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
