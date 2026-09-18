import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { ADCS_DISPOSITION_ISSUED, AdcsEnrollResult, describeAdcsDisposition } from "@app/lib/gateway-v2/adcs-rpc";
import { logger } from "@app/lib/logger";
import { executeAdcsGatewayOperation, resolveAdcsCaName } from "@app/services/app-connection/adcs";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { getAdcsConnectionCredentials } from "../adcs/adcs-connection-credentials";

const RE_CSR_BEGIN = new RE2("-----BEGIN CERTIFICATE REQUEST-----", "g");
const RE_CSR_END = new RE2("-----END CERTIFICATE REQUEST-----", "g");
const RE_CSR_NEWLINES = new RE2("\\s", "g");
const RE_CRLF_NORMALIZE = new RE2("\\r\\n?", "g");

type TAdcsNativeGatewayDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

/**
 * Submits the intermediate CA's CSR to a native AD CS over the gateway (MS-WCCE)
 * and returns the issued certificate plus its chain. The caName is discovered from
 * the CA host when not supplied so the gateway call happens before any DB write.
 */
export const submitCsrToNativeAdcs = async (
  params: {
    appConnectionId: string;
    csr: string;
    template: string;
    caName?: string;
  },
  deps: TAdcsNativeGatewayDeps & {
    appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
    kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  }
): Promise<{ certificate: string; certificateChain: string }> => {
  const { appConnectionId, csr, template } = params;
  const { appConnectionDAL, kmsService, gatewayV2Service, gatewayPoolService } = deps;

  const { credentials, gatewayId, gatewayPoolId } = await getAdcsConnectionCredentials(
    appConnectionId,
    appConnectionDAL,
    kmsService
  );

  const resolvedCaName = await resolveAdcsCaName(
    params.caName,
    async () => ({ gatewayId, gatewayPoolId, credentials }),
    { gatewayV2Service, gatewayPoolService }
  );

  // MS-WCCE expects the CSR as base64-encoded DER PKCS#10.
  const csrDerBase64 = csr.replace(RE_CSR_BEGIN, "").replace(RE_CSR_END, "").replace(RE_CSR_NEWLINES, "");

  const enrollResult = await executeAdcsGatewayOperation<AdcsEnrollResult>(
    {
      gatewayId,
      gatewayPoolId,
      credentials,
      endpoint: "/v1/enroll",
      caName: resolvedCaName,
      params: { template: template.trim(), csr: csrDerBase64 }
    },
    { gatewayV2Service, gatewayPoolService }
  );

  if (enrollResult.disposition !== ADCS_DISPOSITION_ISSUED || !enrollResult.certificatePem) {
    throw new BadRequestError({
      message: describeAdcsDisposition(enrollResult.disposition, {
        requestId: enrollResult.requestId,
        dispositionMessage: enrollResult.dispositionMessage,
        hresult: enrollResult.hresult
      })
    });
  }

  logger.info({ requestId: enrollResult.requestId }, "ADCS native signing: intermediate CA certificate issued");

  const certificate = enrollResult.certificatePem.replace(RE_CRLF_NORMALIZE, "\n").trim();
  const certificateChain = (enrollResult.chainPem || "").replace(RE_CRLF_NORMALIZE, "\n").trim();

  return { certificate, certificateChain };
};
