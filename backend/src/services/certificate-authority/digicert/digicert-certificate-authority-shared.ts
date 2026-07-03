import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { getDigiCertApiBaseUrl } from "@app/services/app-connection/digicert/digicert-connection-fns";
import { TDigiCertConnection } from "@app/services/app-connection/digicert/digicert-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { DigiCertCaPurpose } from "./digicert-certificate-authority-schemas";
import { TDigiCertCertificateAuthority } from "./digicert-certificate-authority-types";

const PEM_CERTIFICATE_RE2 = new RE2("-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----", "g");

export const castDbEntryToDigiCertCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TDigiCertCertificateAuthority & { credentials: Buffer | null | undefined } => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed DigiCert certificate authority" });
  }

  if (!ca.externalCa.appConnectionId) {
    throw new BadRequestError({
      message: "DigiCert app connection ID is missing from certificate authority configuration"
    });
  }

  const config = (ca.externalCa.configuration ?? {}) as {
    organizationId?: number;
    productNameId?: string;
    purpose?: DigiCertCaPurpose;
    verifiedContact?: {
      firstName: string;
      lastName: string;
      email: string;
      jobTitle: string;
      telephone: string;
    };
  };

  if (typeof config.organizationId !== "number" || !config.productNameId) {
    throw new BadRequestError({
      message: "DigiCert certificate authority configuration is missing organization ID or product"
    });
  }

  const purpose = config.purpose ?? DigiCertCaPurpose.Ssl;

  return {
    id: ca.id,
    type: CaType.DIGICERT,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    credentials: ca.externalCa.credentials,
    configuration: {
      appConnectionId: ca.externalCa.appConnectionId,
      organizationId: config.organizationId,
      productNameId: config.productNameId,
      purpose,
      verifiedContact: config.verifiedContact
    },
    status: ca.status as CaStatus
  };
};

export const getDigiCertClientCredentials = async (
  appConnectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<{ apiKey: string; baseUrl: string }> => {
  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `DigiCert app connection with ID '${appConnectionId}' not found` });
  }
  if (appConnection.app !== AppConnection.DigiCert) {
    throw new BadRequestError({ message: `App connection with ID '${appConnectionId}' is not a DigiCert connection` });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: appConnection.orgId,
    projectId: appConnection.projectId,
    encryptedCredentials: appConnection.encryptedCredentials,
    kmsService
  })) as TDigiCertConnection["credentials"];

  return {
    apiKey: credentials.apiKey,
    baseUrl: getDigiCertApiBaseUrl(credentials)
  };
};

export const extractLeafAndChain = (pemBundle: string): { leaf: string; chain: string } => {
  const matches = pemBundle.match(PEM_CERTIFICATE_RE2);
  if (!matches || matches.length === 0) {
    throw new BadRequestError({ message: "DigiCert returned an empty certificate bundle" });
  }

  if (matches.length < 2) {
    throw new BadRequestError({
      message: `DigiCert returned an incomplete certificate bundle (${matches.length} entry, expected leaf + chain)`
    });
  }

  let leafIndex = -1;
  matches.forEach((pem, index) => {
    if (leafIndex !== -1) return;
    try {
      const cert = new x509.X509Certificate(pem);
      const basicConstraints = cert.getExtension(x509.BasicConstraintsExtension);
      if (!basicConstraints?.ca) leafIndex = index;
    } catch {
      // skip unparseable entries
    }
  });

  if (leafIndex === -1) leafIndex = 0;

  const leaf = matches[leafIndex].trim();
  const chain = matches
    .filter((_, index) => index !== leafIndex)
    .map((cert) => cert.trim())
    .join("\n");
  return { leaf, chain };
};
