import { TProjectPermission } from "@app/lib/types";

export enum CaType {
  ROOT = "root",
  INTERMEDIATE = "intermediate"
}

export enum CaStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
  PENDING_CERTIFICATE = "pending-certificate"
}

export enum CertKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1"
}

export type TCreateCaDTO = {
  projectSlug: string;
  type: CaType;
  commonName: string;
  organization: string;
  ou: string;
  country: string;
  province: string;
  locality: string;
  notBefore?: string;
  notAfter?: string;
  maxPathLength: number;
  keyAlgorithm: CertKeyAlgorithm;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateCaDTO = {
  caId: string;
  status?: CaStatus;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCsrDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetCaCertDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TSignIntermediateDTO = {
  caId: string;
  csr: string;
  notBefore?: string;
  notAfter: string;
  maxPathLength: number;
} & Omit<TProjectPermission, "projectId">;

export type TImportCertToCaDTO = {
  caId: string;
  certificate: string;
  certificateChain: string;
} & Omit<TProjectPermission, "projectId">;

export type TIssueCertFromCaDTO = {
  caId: string;
  commonName: string;
  ttl?: number;
  notBefore?: string;
  notAfter?: string;
} & Omit<TProjectPermission, "projectId">;

export type TDNParts = {
  commonName?: string;
  organization?: string;
  ou?: string;
  country?: string;
  province?: string;
  locality?: string;
};
