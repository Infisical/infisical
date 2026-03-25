/* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
import { z } from "zod";

import { TPamResources } from "@app/db/schemas";
import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";

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
  TMongoDBAccount,
  TMongoDBAccountCredentials,
  TMongoDBResource,
  TMongoDBResourceConnectionDetails
} from "./mongodb/mongodb-resource-types";
import {
  TMsSQLAccount,
  TMsSQLAccountCredentials,
  TMsSQLResource,
  TMsSQLResourceConnectionDetails
} from "./mssql/mssql-resource-types";
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
  TSSHResourceInternalMetadata
} from "./ssh/ssh-resource-types";
import {
  TWindowsAccount,
  TWindowsAccountCredentials,
  TWindowsResource,
  TWindowsResourceConnectionDetails,
  TWindowsResourceInternalMetadata
} from "./windows-server/windows-server-resource-types";

// Resource types
export type TPamResource =
  | TPostgresResource
  | TMySQLResource
  | TMsSQLResource
  | TSSHResource
  | TAwsIamResource
  | TKubernetesResource
  | TRedisResource
  | TMongoDBResource
  | TWindowsResource
  | TActiveDirectoryResource;
export type TPamResourceWithFavorite = TPamResources & { isFavorite: boolean };
export type TPamResourceConnectionDetails =
  | TPostgresResourceConnectionDetails
  | TMySQLResourceConnectionDetails
  | TMsSQLResourceConnectionDetails
  | TSSHResourceConnectionDetails
  | TKubernetesResourceConnectionDetails
  | TAwsIamResourceConnectionDetails
  | TRedisResourceConnectionDetails
  | TMongoDBResourceConnectionDetails
  | TWindowsResourceConnectionDetails
  | TActiveDirectoryResourceConnectionDetails;
export type TPamResourceInternalMetadata = TSSHResourceInternalMetadata | TWindowsResourceInternalMetadata;

// Account types
export type TPamAccount =
  | TPostgresAccount
  | TMySQLAccount
  | TMsSQLAccount
  | TSSHAccount
  | TAwsIamAccount
  | TKubernetesAccount
  | TRedisAccount
  | TMongoDBAccount
  | TWindowsAccount
  | TActiveDirectoryAccount;

export type TPamAccountCredentials =
  | TPostgresAccountCredentials
  | TMySQLAccountCredentials
  | TMsSQLAccountCredentials
  | TSSHAccountCredentials
  | TKubernetesAccountCredentials
  | TAwsIamAccountCredentials
  | TRedisAccountCredentials
  | TMongoDBAccountCredentials
  | TWindowsAccountCredentials
  | TActiveDirectoryAccountCredentials;

// Resource DTOs
export type TCreateResourceDTO = Pick<TPamResource, "name" | "connectionDetails" | "resourceType" | "projectId"> & {
  gatewayId?: string | null;
  rotationAccountCredentials?: TPamAccountCredentials | null;
  adServerResourceId?: string | null;
  metadata?: z.input<typeof ResourceMetadataNonEncryptionSchema>;
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
  metadataFilter?: Array<{ key: string; value?: string }>;
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
  M extends TPamResourceInternalMetadata
> = (
  resourceType: PamResource,
  connectionDetails: T,
  gatewayId: string | null | undefined,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  projectId: string | null | undefined,
  resourceInternalMetadata?: M
) => {
  validateConnection: TPamResourceFactoryValidateConnection<T>;
  validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<C>;
  rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<C>;
  handleOverwritePreventionForCensoredValues: (updatedAccountCredentials: C, currentCredentials: C) => Promise<C>;
};
