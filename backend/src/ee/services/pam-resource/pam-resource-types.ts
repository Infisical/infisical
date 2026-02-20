import { OrderByDirection, TProjectPermission } from "@app/lib/types";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import {
  TActiveDirectoryAccount,
  TActiveDirectoryAccountCredentials,
  TActiveDirectoryResource,
  TActiveDirectoryResourceConnectionDetails
} from "./active-directory/active-directory-resource-types";
import {
  TAwsIamAccount,
  TAwsIamAccountCredentials,
  TAwsIamResource,
  TAwsIamResourceConnectionDetails
} from "./aws-iam/aws-iam-resource-types";
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
  TRedisAccount,
  TRedisAccountCredentials,
  TRedisResource,
  TRedisResourceConnectionDetails
} from "./redis/redis-resource-types";
import {
  TSSHAccount,
  TSSHAccountCredentials,
  TSSHResource,
  TSSHResourceConnectionDetails,
  TSSHResourceMetadata
} from "./ssh/ssh-resource-types";
import {
  TWindowsAccount,
  TWindowsAccountCredentials,
  TWindowsResource,
  TWindowsResourceConnectionDetails,
  TWindowsResourceMetadata
} from "./windows-server/windows-server-resource-types";

// Resource types
export type TPamResource =
  | TPostgresResource
  | TMySQLResource
  | TSSHResource
  | TAwsIamResource
  | TKubernetesResource
  | TRedisResource
  | TWindowsResource
  | TActiveDirectoryResource;
export type TPamResourceConnectionDetails =
  | TPostgresResourceConnectionDetails
  | TMySQLResourceConnectionDetails
  | TSSHResourceConnectionDetails
  | TKubernetesResourceConnectionDetails
  | TAwsIamResourceConnectionDetails
  | TRedisResourceConnectionDetails
  | TWindowsResourceConnectionDetails
  | TActiveDirectoryResourceConnectionDetails;
export type TPamResourceMetadata = TSSHResourceMetadata | TWindowsResourceMetadata;

// Account types
export type TPamAccount =
  | TPostgresAccount
  | TMySQLAccount
  | TSSHAccount
  | TAwsIamAccount
  | TKubernetesAccount
  | TRedisAccount
  | TWindowsAccount
  | TActiveDirectoryAccount;

export type TPamAccountCredentials =
  | TPostgresAccountCredentials
  // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
  | TMySQLAccountCredentials
  | TSSHAccountCredentials
  | TKubernetesAccountCredentials
  | TAwsIamAccountCredentials
  | TRedisAccountCredentials
  | TWindowsAccountCredentials
  | TActiveDirectoryAccountCredentials;

// Resource DTOs
export type TCreateResourceDTO = Pick<TPamResource, "name" | "connectionDetails" | "resourceType" | "projectId"> & {
  gatewayId?: string | null;
  rotationAccountCredentials?: TPamAccountCredentials | null;
  adServerResourceId?: string | null;
};

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

export type TPamResourceFactory<
  T extends TPamResourceConnectionDetails,
  C extends TPamAccountCredentials,
  M extends TPamResourceMetadata
> = (
  resourceType: PamResource,
  connectionDetails: T,
  gatewayId: string | null | undefined,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  projectId: string | null | undefined,
  resourceMetadata?: M
) => {
  validateConnection: TPamResourceFactoryValidateConnection<T>;
  validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<C>;
  rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<C>;
  handleOverwritePreventionForCensoredValues: (updatedAccountCredentials: C, currentCredentials: C) => Promise<C>;
};
