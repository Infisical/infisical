import { TProjectPermission } from "@app/lib/types";
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
} & TProjectPermission;

export type TGetSshCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetSshCaPublicKeyDTO = {
  caId: string;
};

export type TUpdateSshCaDTO = {
  caId: string;
  friendlyName?: string;
  status?: SshCaStatus;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteSshCaDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIssueSshCredsDTO = {
  templateName: string;
  keyAlgorithm: CertKeyAlgorithm;
  certType: SshCertType;
  principals: string[];
  ttl?: string;
  keyId?: string;
} & TProjectPermission;

export type TSignSshKeyDTO = {
  templateName: string;
  publicKey: string;
  certType: SshCertType;
  principals: string[];
  ttl?: string;
  keyId?: string;
} & TProjectPermission;

export type TGetSshCaCertificateTemplatesDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateSshCertDTO = {
  caPrivateKey: string;
  userPublicKey: string;
  keyId: string;
  principals: string[];
  ttl: number;
  certType: SshCertType;
};
