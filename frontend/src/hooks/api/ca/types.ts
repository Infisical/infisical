import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "../certificates/enums";
import { AcmeDnsProvider, CaRenewalType, CaStatus, CaType, InternalCaType } from "./enums";

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
  };
};

export type TUnifiedCertificateAuthority =
  | TAcmeCertificateAuthority
  | TAzureAdCsCertificateAuthority
  | TInternalCertificateAuthority;

export type TCreateCertificateAuthorityDTO = Omit<TUnifiedCertificateAuthority, "id">;
export type TUpdateCertificateAuthorityDTO = Partial<TUnifiedCertificateAuthority> & {
  caName: string;
  projectId: string;
  type: CaType;
};

export type TDeleteCertificateAuthorityDTO = {
  caName: string;
  type: CaType;
  projectId: string;
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
  projectSlug: string;
  caId: string;
  status?: CaStatus;
  requireTemplateForIssuance?: boolean;
};

export type TDeleteCaDTO = {
  projectSlug: string;
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

export type TImportCaCertificateDTO = {
  caId: string;
  projectSlug: string;
  certificate: string;
  certificateChain: string;
};

export type TImportCaCertificateResponse = {
  message: string;
  caId: string;
};

export type TCreateCertificateDTO = {
  projectSlug: string;
  caId?: string;
  certificateTemplateId?: string;
  pkiCollectionId?: string;
  friendlyName?: string;
  commonName: string;
  altNames: string; // sans
  ttl: string; // string compatible with ms
  notBefore?: string;
  notAfter?: string;
  keyUsages: CertKeyUsage[];
  extendedKeyUsages: CertExtendedKeyUsage[];
};

export type TCreateCertificateResponse = {
  certificate: string;
  issuingCertificate: string;
  certificateChain: string;
  privateKey: string;
  serialNumber: string;
};

export type TRenewCaDTO = {
  projectSlug: string;
  caId: string;
  type: CaRenewalType;
  notAfter: string;
};

export type TRenewCaResponse = {
  certificate: string;
  certificateChain: string;
  serialNumber: string;
};
