import { SymmetricEncryption } from "@app/lib/crypto/cipher";
import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { KmipPermission } from "./kmip-enum";

export type TCreateKmipClientCertificateDTO = {
  clientId: string;
  keyAlgorithm: CertKeyAlgorithm;
  ttl: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateKmipClientDTO = {
  name: string;
  description?: string;
  permissions: KmipPermission[];
} & TProjectPermission;

export type TUpdateKmipClientDTO = {
  id: string;
  name?: string;
  description?: string;
  permissions?: KmipPermission[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteKmipClientDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetKmipClientDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export enum KmipClientOrderBy {
  Name = "name"
}

export type TListKmipClientsByProjectIdDTO = {
  offset?: number;
  limit?: number;
  orderBy?: KmipClientOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
} & TProjectPermission;

export type TKmipCreateDTO = {
  clientId: string;
  projectId: string;
  encryptionAlgorithm: SymmetricEncryption;
};

export type TKmipGetDTO = {
  clientId: string;
  projectId: string;
  id: string;
};
