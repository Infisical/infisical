import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { OrderByDirection, TOrgPermission, TProjectPermission } from "@app/lib/types";
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

type KmipOperationBaseDTO = {
  clientId: string;
  projectId: string;
} & Omit<TOrgPermission, "orgId">;

export type TKmipCreateDTO = {
  algorithm: SymmetricKeyAlgorithm;
} & KmipOperationBaseDTO;

export type TKmipGetDTO = {
  id: string;
} & KmipOperationBaseDTO;

export type TKmipGetAttributesDTO = {
  id: string;
} & KmipOperationBaseDTO;

export type TKmipDestroyDTO = {
  id: string;
} & KmipOperationBaseDTO;

export type TKmipActivateDTO = {
  id: string;
} & KmipOperationBaseDTO;

export type TKmipRevokeDTO = {
  id: string;
} & KmipOperationBaseDTO;

export type TKmipLocateDTO = KmipOperationBaseDTO;

export type TKmipRegisterDTO = {
  name: string;
  key: string;
  algorithm: SymmetricKeyAlgorithm;
  kmipMetadata?: Record<string, unknown> | null;
} & KmipOperationBaseDTO;

export type TGenerateOrgKmipServerCertificateDTO = {
  commonName: string;
  altNames: string;
  keyAlgorithm: CertKeyAlgorithm;
  ttl: string;
  orgId: string;
};

export type TRegisterServerDTO = {
  hostnamesOrIps: string;
  commonName?: string;
  keyAlgorithm?: CertKeyAlgorithm;
  ttl: string;
} & Omit<TOrgPermission, "orgId">;
