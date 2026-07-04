import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "../certificates/enums";
import {
  AcmeDnsProvider,
  CaRenewalType,
  CaStatus,
  CaType,
  GoDaddyProductType,
  InternalCaType
} from "./enums";

export type TAcmeCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.ACME;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    dnsAppConnectionId: string;
    dnsProviderConfig: {
      provider: AcmeDnsProvider;
      hostedZoneId: string;
    };
    directoryUrl: string;
    accountEmail: string;
    eabKid?: string;
    dnsResolver?: string;
  };
};

export type TAzureAdCsCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.AZURE_AD_CS;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    azureAdcsConnectionId: string;
    templateName: string;
  };
};

export type TAdcsCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.ADCS;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    appConnectionId: string;
    caName: string;
  };
};

export type TAwsPcaCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.AWS_PCA;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    appConnectionId: string;
    certificateAuthorityArn: string;
    region: string;
  };
};

export enum DigiCertCaPurpose {
  Ssl = "ssl",
  CodeSigning = "code_signing"
}

export type TDigiCertVerifiedContact = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  telephone: string;
};

export type TDigiCertCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.DIGICERT;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    appConnectionId: string;
    organizationId: number;
    productNameId: string;
    purpose?: DigiCertCaPurpose;
    verifiedContact?: TDigiCertVerifiedContact;
  };
};

export type TGoDaddyCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.GODADDY;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    appConnectionId: string;
    productType: GoDaddyProductType;
  };
};

export type TAwsAcmPublicCaCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.AWS_ACM_PUBLIC_CA;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    appConnectionId: string;
    dnsAppConnectionId: string;
    hostedZoneId: string;
    region: string;
  };
};

export type TVenafiTppCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.VENAFI_TPP;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    appConnectionId: string;
    policyDN: string;
  };
};

export type TInternalCertificateAuthority = {
  id: string;
  projectId: string;
  type: CaType.INTERNAL;
  status: CaStatus;
  name: string;
  enableDirectIssuance: boolean;
  configuration: {
    type: InternalCaType;
    friendlyName?: string;
    commonName: string;
    organization: string;
    ou: string;
    country: string;
    province: string;
    locality: string;
    maxPathLength: number;
    keyAlgorithm: CertKeyAlgorithm;
    notAfter?: string;
    notBefore?: string;
    dn?: string;
    parentCaId?: string;
    serialNumber?: string;
    activeCaCertId?: string;
    crlDistributionPointUrls?: string[];
    disableManagedCrlDistributionPointUrl?: boolean;
  };
};

export const MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS = 4;
export const MAX_DISTRIBUTION_POINT_URL_LENGTH = 2048;

export type TUnifiedCertificateAuthority =
  | TAcmeCertificateAuthority
  | TAzureAdCsCertificateAuthority
  | TAdcsCertificateAuthority
  | TAwsPcaCertificateAuthority
  | TDigiCertCertificateAuthority
  | TGoDaddyCertificateAuthority
  | TAwsAcmPublicCaCertificateAuthority
  | TVenafiTppCertificateAuthority
  | TInternalCertificateAuthority;

export type TCreateCertificateAuthorityDTO = Omit<
  TUnifiedCertificateAuthority,
  "id" | "enableDirectIssuance" | "projectId"
>;
export type TUpdateCertificateAuthorityDTO = Partial<
  Omit<TUnifiedCertificateAuthority, "projectId">
> & {
  id: string;
  type: CaType;
};

export type TDeleteCertificateAuthorityDTO = {
  id: string;
  type: CaType;
};

export type TCertificateAuthority = {
  id: string;
  parentCaId?: string;
  projectId: string;
  type: InternalCaType;
  status: CaStatus;
  friendlyName: string;
  organization: string;
  ou: string;
  country: string;
  province: string;
  locality: string;
  commonName: string;
  dn: string;
  maxPathLength?: number;
  notAfter?: string;
  notBefore?: string;
  keyAlgorithm: CertKeyAlgorithm;
  requireTemplateForIssuance: boolean;
  activeCaCertId?: string;
  createdAt: string;
  updatedAt: string;
};

export type TUpdateCaDTO = {
  caId: string;
  status?: CaStatus;
  requireTemplateForIssuance?: boolean;
};

export type TDeleteCaDTO = {
  caId: string;
};

export type TSignIntermediateDTO = {
  caId: string;
  csr: string;
  maxPathLength: number;
  notBefore?: string;
  notAfter?: string;
};

export type TSignIntermediateResponse = {
  certificate: string;
  certificateChain: string;
  issuingCaCertificate: string;
  serialNumber: string;
};

export type TAzureAdCsTemplate = {
  id: string;
  name: string;
  description?: string;
};

export type TAdcsTemplate = {
  id: string;
  name: string;
};

export type TImportCaCertificateDTO = {
  caId: string;
  certificate: string;
  certificateChain: string;
};

export type TImportCaCertificateResponse = {
  message: string;
  caId: string;
};

export type TCreateCertificateDTO = {
  caId?: string;
  certificateTemplateId?: string;
  pkiCollectionId?: string;
  friendlyName?: string;
  commonName: string;
  subjectAltNames: string; // sans
  ttl: string; // string compatible with ms
  notBefore?: string;
  notAfter?: string;
  keyUsages: string[];
  extendedKeyUsages: string[];
};

export type TCreateCertificateResponse = {
  certificate: string;
  issuingCertificate: string;
  certificateChain: string;
  privateKey: string;
  serialNumber: string;
};

export type TCreateCertificateV3DTO = {
  profileId: string;
  pkiCollectionId?: string;
  friendlyName?: string;
  commonName?: string;
  organization?: string;
  organizationalUnit?: string;
  locality?: string;
  state?: string;
  country?: string;
  email?: string;
  streetAddress?: string;
  postalCode?: string;
  subjectAltNames: string;
  ttl: string;
  notBefore?: string;
  notAfter?: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
  signatureAlgorithm?: string;
  keyAlgorithm?: string;
};

export type TCreateCertificateV3Response = TCreateCertificateResponse & {
  projectId: string;
  profileName: string;
  certificateId: string;
};

export type TOrderCertificateDTO = {
  profileId: string;
  subjectAlternativeNames: Array<{
    type: "dns" | "ip";
    value: string;
  }>;
  ttl: string;
  keyUsages?: CertKeyUsage[];
  extendedKeyUsages?: CertExtendedKeyUsage[];
  notBefore?: string;
  notAfter?: string;
  commonName?: string;
  signatureAlgorithm?: string;
  keyAlgorithm?: string;
};

export type TOrderCertificateResponse = {
  orderId: string;
  status: "pending" | "processing" | "valid" | "invalid";
  subjectAlternativeNames: Array<{
    type: "dns" | "ip";
    value: string;
    status: "pending" | "processing" | "valid" | "invalid";
  }>;
  authorizations: Array<{
    identifier: {
      type: "dns" | "ip";
      value: string;
    };
    status: "pending" | "processing" | "valid" | "invalid";
    expires?: string;
    challenges: Array<{
      type: string;
      status: "pending" | "processing" | "valid" | "invalid";
      url: string;
      token: string;
      validated?: string;
      error?: string | Error;
    }>;
  }>;
  certificate?: string;
  privateKey?: string;
  expires: string;
  notBefore: string;
  notAfter: string;
};

export type TRenewCaDTO = {
  caId: string;
  type: CaRenewalType;
  notAfter: string;
};

export type TRenewCaResponse = {
  certificate: string;
  certificateChain: string;
  serialNumber: string;
  projectId: string;
};
