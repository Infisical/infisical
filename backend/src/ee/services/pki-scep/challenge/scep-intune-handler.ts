import * as x509 from "@peculiar/x509";

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

const toThumbprint = async (cert: x509.X509Certificate) => {
  const digest = await cert.getThumbprint("SHA-1");
  return Buffer.from(digest).toString("hex").toUpperCase();
};

export const intuneDelegatedHandler = (deps: TScepValidationHandlerDeps): IScepValidationHandler => {
  // Cache the service URI + token across this handler's calls.
  let cached: { serviceUri: string; intuneToken: string } | null = null;

  const resolveIntune = async (connectionId?: string | null) => {
    if (!connectionId) {
      throw new BadRequestError({
        message: "SCEP enrollment is configured for Microsoft Intune validation but no connection is selected."
      });
    }
    if (cached) return cached;

    const connection = await deps.appConnectionDAL.findById(connectionId);
    if (!connection || connection.app !== AppConnection.MicrosoftIntune) {
      throw new BadRequestError({ message: "The configured Microsoft Intune connection could not be found." });
    }

    const credentials = (await decryptAppConnectionCredentials({
      orgId: connection.orgId,
      projectId: connection.projectId,
      encryptedCredentials: connection.encryptedCredentials,
      kmsService: deps.kmsService
    })) as TMicrosoftIntuneConnectionCredentials;

    const graphToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Graph);
    const serviceUri = await discoverScepValidationServiceUri(graphToken);
    const intuneToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Intune);

    cached = { serviceUri, intuneToken };
    return cached;
  };

  return {
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
