import { OrgServiceActor } from "@app/lib/types";

// per-condition match operator; only exact-match ("is") is supported today,
// but this is kept as an enum so additional operators can be added later.
export enum SecretMetadataSearchOperator {
  Is = "is"
}

// combinator applied across all conditions.
export enum SecretMetadataSearchLogicalOperator {
  And = "and",
  Or = "or"
}

export type TSecretMetadataSearchFilter = {
  key: string;
  value: string;
  operator: SecretMetadataSearchOperator;
};

// DAL input
export type TSearchSecretMetadataDALDTO = {
  orgId: string;
  projectId: string;
  filters: TSecretMetadataSearchFilter[];
  operator: SecretMetadataSearchLogicalOperator;
  limit?: number;
};

// service input
export type TSearchSecretMetadataDTO = {
  projectId: string;
  filters: TSecretMetadataSearchFilter[];
  operator: SecretMetadataSearchLogicalOperator;
  actor: OrgServiceActor;
};
