import { CertKeyAlgorithm } from "../certificates/enums";
import { SshCaStatus, SshCertType } from "./enums";

export type TSshCertificateAuthority = {
  id: string;
  orgId: string;
  status: SshCaStatus;
  friendlyName: string;
  keyAlgorithm: CertKeyAlgorithm;
  createdAt: string;
  updatedAt: string;
  publicKey: string;
};

export type TCreateSshCaDTO = {
  friendlyName?: string;
  keyAlgorithm: CertKeyAlgorithm;
};

export type TUpdateSshCaDTO = {
  caId: string;
  friendlyName?: string;
  status?: SshCaStatus;
};

export type TDeleteSshCaDTO = {
  caId: string;
};

export type TIssueSshCredsDTO = {
  templateName: string;
  keyAlgorithm: CertKeyAlgorithm;
  certType: SshCertType;
  principals: string[];
  ttl?: string;
  keyId?: string;
};

export type TIssueSshCredsResponse = {
  serialNumber: string;
  signedKey: string;
  privateKey: string;
  publicKey: string;
  keyAlgorithm: CertKeyAlgorithm;
};
