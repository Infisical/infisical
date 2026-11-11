import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { OrderByDirection, TActorInput } from "@app/lib/types";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { KmipPermission } from "./kmip-enum";

export type TCreateKmipClientCertificateDTO = {
  clientId: string;
  keyAlgorithm?: CertKeyAlgorithm;
  ttl: string;
  csr?: string;
} & TActorInput;

export type TCreateKmipClientDTO = {
  name: string;
  description?: string;
  permissions: KmipPermission[];
  projectId: string;
} & TActorInput;

export type TUpdateKmipClientDTO = {
  id: string;
  name?: string;
  description?: string;
  permissions?: KmipPermission[];
} & TActorInput;

export type TDeleteKmipClientDTO = {
  id: string;
} & TActorInput;

export type TGetKmipClientDTO = {
  id: string;
} & TActorInput;

export enum KmipClientOrderBy {
  Name = "name"
}

export type TListKmipClientsByProjectIdDTO = {
  offset?: number;
  limit?: number;
  orderBy?: KmipClientOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  projectId: string;
} & TActorInput;

type KmipOperationBaseDTO = {
  clientId: string;
  projectId: string;
} & TActorInput;

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
} & TActorInput;
