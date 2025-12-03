import { OrderByDirection, TProjectPermission } from "@app/lib/types";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import {
  TKubernetesAccount,
  TKubernetesAccountCredentials,
  TKubernetesResource,
  TKubernetesResourceConnectionDetails
} from "./kubernetes/kubernetes-resource-types";
import {
  TMySQLAccount,
  TMySQLAccountCredentials,
  TMySQLResource,
  TMySQLResourceConnectionDetails
} from "./mysql/mysql-resource-types";
import { PamResource, PamResourceOrderBy } from "./pam-resource-enums";
import {
  TPostgresAccount,
  TPostgresAccountCredentials,
  TPostgresResource,
  TPostgresResourceConnectionDetails
} from "./postgres/postgres-resource-types";
import {
  TSSHAccount,
  TSSHAccountCredentials,
  TSSHResource,
  TSSHResourceConnectionDetails
} from "./ssh/ssh-resource-types";

// Resource types
export type TPamResource = TPostgresResource | TMySQLResource | TSSHResource | TKubernetesResource;
export type TPamResourceConnectionDetails =
  | TPostgresResourceConnectionDetails
  | TMySQLResourceConnectionDetails
  | TSSHResourceConnectionDetails
  | TKubernetesResourceConnectionDetails;

// Account types
export type TPamAccount = TPostgresAccount | TMySQLAccount | TSSHAccount | TKubernetesAccount;
// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
export type TPamAccountCredentials =
  | TPostgresAccountCredentials
  | TMySQLAccountCredentials
  | TSSHAccountCredentials
  | TKubernetesAccountCredentials;

// Resource DTOs
export type TCreateResourceDTO = Pick<
  TPamResource,
  "name" | "connectionDetails" | "resourceType" | "gatewayId" | "projectId" | "rotationAccountCredentials"
>;

export type TUpdateResourceDTO = Partial<Omit<TCreateResourceDTO, "resourceType" | "projectId">> & {
  resourceId: string;
};

export type TListResourcesDTO = {
  search?: string;
  orderBy?: PamResourceOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
  filterResourceTypes?: string[];
} & TProjectPermission;

// Resource factory
export type TPamResourceFactoryValidateConnection<T extends TPamResourceConnectionDetails> = () => Promise<T>;
export type TPamResourceFactoryValidateAccountCredentials<C extends TPamAccountCredentials> = (
  credentials: C
) => Promise<C>;
export type TPamResourceFactoryRotateAccountCredentials<C extends TPamAccountCredentials> = (
  rotationAccountCredentials: C,
  currentCredentials: C
) => Promise<C>;

export type TPamResourceFactory<T extends TPamResourceConnectionDetails, C extends TPamAccountCredentials> = (
  resourceType: PamResource,
  connectionDetails: T,
  gatewayId: string,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  validateConnection: TPamResourceFactoryValidateConnection<T>;
  validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<C>;
  rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<C>;
  handleOverwritePreventionForCensoredValues: (updatedAccountCredentials: C, currentCredentials: C) => Promise<C>;
};
