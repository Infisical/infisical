import { CaStatus,CaType } from "./enums";

export type TCertificateAuthority = {
  id: string;
  parentCaId?: string;
  projectId: string;
  type: CaType;
  status: CaStatus;
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
  createdAt: string;
  updatedAt: string;
};

export type TCreateCaDTO = {
  projectSlug: string;
  type: string;
  organization: string;
  ou: string;
  country: string;
  province: string;
  locality: string;
  commonName: string;
  notAfter?: string;
  maxPathLength: number;
};

export type TUpdateCaDTO = {
  projectSlug: string;
  caId: string;
  status?: CaStatus;
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

// TODO: add TTL
export type TCreateCertificateDTO = {
  projectSlug: string;
  caId: string;
  commonName: string;
  ttl?: number;
  notBefore?: string;
  notAfter?: string;
};

export type TCreateCertificateResponse = {
  certificate: string;
  issuingCertificate: string;
  certificateChain: string;
  sk: string;
  serialNumber: string;
};
