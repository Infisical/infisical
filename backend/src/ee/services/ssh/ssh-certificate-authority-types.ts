import { TOrgPermission } from "@app/lib/types";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

export enum SshCaStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

export enum SshCertType {
  USER = "user",
  HOST = "host"
}

export type TCreateSshCaDTO = {
  friendlyName: string;
  keyAlgorithm: CertKeyAlgorithm;
} & Omit<TOrgPermission, "orgId">;

export type TGetSshCaDTO = {
  caId: string;
} & Omit<TOrgPermission, "orgId">;

export type TUpdateSshCaDTO = {
  caId: string;
  friendlyName?: string;
  status?: SshCaStatus;
} & Omit<TOrgPermission, "orgId">;

export type TDeleteSshCaDTO = {
  caId: string;
} & Omit<TOrgPermission, "orgId">;

export type TIssueSshCredsDTO = {
  templateName: string;
  keyAlgorithm: CertKeyAlgorithm;
  certType: SshCertType;
  principals: string[];
  ttl?: string;
  keyId?: string;
} & Omit<TOrgPermission, "orgId">;

export type TSignSshKeyDTO = {
  templateName: string;
  publicKey: string;
  certType: SshCertType;
  principals: string[];
  ttl?: string;
  keyId?: string;
} & Omit<TOrgPermission, "orgId">;

export type TGetSshCaCertificateTemplatesDTO = {
  caId: string;
} & Omit<TOrgPermission, "orgId">;

export type TCreateSshCertDTO = {
  caPrivateKey: string;
  userPublicKey: string;
  keyId: string;
  principals: string[];
  ttl: number;
  certType: SshCertType;
};
