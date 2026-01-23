import { Knex } from "knex";

import { TSshCertificateTemplates } from "@app/db/schemas/ssh-certificate-templates";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { TProjectPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

export enum SshCaStatus {
  ACTIVE = "active",
  DISABLED = "disabled"
}

export enum SshCaKeySource {
  INTERNAL = "internal",
  EXTERNAL = "external"
}

export enum SshCertType {
  USER = "user",
  HOST = "host"
}

export type TCreateSshCaDTO = {
  friendlyName: string;
  keyAlgorithm: SshCertKeyAlgorithm;
  publicKey?: string;
  privateKey?: string;
  keySource: SshCaKeySource;
} & TProjectPermission;

export type TCreateSshCaHelperDTO = {
  projectId: string;
  friendlyName: string;
  keyAlgorithm: SshCertKeyAlgorithm;
  keySource: SshCaKeySource;
  externalPk?: string;
  externalSk?: string;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "transaction" | "create">;
  sshCertificateAuthoritySecretDAL: Pick<TSshCertificateAuthoritySecretDALFactory, "create">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  tx?: Knex;
};

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
  certificateTemplateId: string;
  keyAlgorithm: SshCertKeyAlgorithm;
  certType: SshCertType;
  principals: string[];
  ttl?: string;
  keyId?: string;
} & Omit<TProjectPermission, "projectId">;

export type TSignSshKeyDTO = {
  certificateTemplateId: string;
  publicKey: string;
  certType: SshCertType;
  principals: string[];
  ttl?: string;
  keyId?: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetSshCaCertificateTemplatesDTO = {
  caId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateSshCertDTO = {
  template?: TSshCertificateTemplates;
  caPrivateKey: string;
  clientPublicKey: string;
  keyId: string;
  principals: string[];
  requestedTtl?: string;
  certType: SshCertType;
};

export type TConvertActorToPrincipalsDTO = {
  actor: ActorType;
  actorId: string;
  userDAL: Pick<TUserDALFactory, "findById">;
};
