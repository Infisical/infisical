import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TSqlCredentialsRotationGeneratedCredentials } from "@app/ee/services/secret-rotation-v2/shared/sql-credentials/sql-credentials-rotation-types";
import { OrderByDirection } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import {
  TAuth0ClientSecretRotation,
  TAuth0ClientSecretRotationGeneratedCredentials,
  TAuth0ClientSecretRotationInput,
  TAuth0ClientSecretRotationListItem,
  TAuth0ClientSecretRotationWithConnection
} from "./auth0-client-secret";
import {
  TAwsIamUserSecretRotation,
  TAwsIamUserSecretRotationGeneratedCredentials,
  TAwsIamUserSecretRotationInput,
  TAwsIamUserSecretRotationListItem,
  TAwsIamUserSecretRotationWithConnection
} from "./aws-iam-user-secret";
import {
  TAzureClientSecretRotation,
  TAzureClientSecretRotationGeneratedCredentials,
  TAzureClientSecretRotationInput,
  TAzureClientSecretRotationListItem,
  TAzureClientSecretRotationWithConnection
} from "./azure-client-secret";
import {
  TDatabricksServicePrincipalSecretRotation,
  TDatabricksServicePrincipalSecretRotationGeneratedCredentials,
  TDatabricksServicePrincipalSecretRotationInput,
  TDatabricksServicePrincipalSecretRotationListItem,
  TDatabricksServicePrincipalSecretRotationWithConnection
} from "./databricks-service-principal-secret";
import {
  TLdapPasswordRotation,
  TLdapPasswordRotationGeneratedCredentials,
  TLdapPasswordRotationInput,
  TLdapPasswordRotationListItem,
  TLdapPasswordRotationWithConnection
} from "./ldap-password";
import {
  TMongoDBCredentialsRotation,
  TMongoDBCredentialsRotationInput,
  TMongoDBCredentialsRotationListItem,
  TMongoDBCredentialsRotationWithConnection
} from "./mongodb-credentials";
import {
  TMsSqlCredentialsRotation,
  TMsSqlCredentialsRotationInput,
  TMsSqlCredentialsRotationListItem,
  TMsSqlCredentialsRotationWithConnection
} from "./mssql-credentials";
import {
  TMySqlCredentialsRotation,
  TMySqlCredentialsRotationInput,
  TMySqlCredentialsRotationListItem,
  TMySqlCredentialsRotationWithConnection
} from "./mysql-credentials";
import {
  TOktaClientSecretRotation,
  TOktaClientSecretRotationGeneratedCredentials,
  TOktaClientSecretRotationInput,
  TOktaClientSecretRotationListItem,
  TOktaClientSecretRotationWithConnection
} from "./okta-client-secret";
import {
  TOracleDBCredentialsRotation,
  TOracleDBCredentialsRotationInput,
  TOracleDBCredentialsRotationListItem,
  TOracleDBCredentialsRotationWithConnection
} from "./oracledb-credentials";
import {
  TPostgresCredentialsRotation,
  TPostgresCredentialsRotationInput,
  TPostgresCredentialsRotationListItem,
  TPostgresCredentialsRotationWithConnection
} from "./postgres-credentials";
import {
  TRedisCredentialsRotation,
  TRedisCredentialsRotationGeneratedCredentials,
  TRedisCredentialsRotationInput,
  TRedisCredentialsRotationListItem,
  TRedisCredentialsRotationWithConnection
} from "./redis-credentials/redis-credentials-rotation-types";
import { TSecretRotationV2DALFactory } from "./secret-rotation-v2-dal";
import { SecretRotation } from "./secret-rotation-v2-enums";
import {
  TUnixLinuxLocalAccountRotation,
  TUnixLinuxLocalAccountRotationGeneratedCredentials,
  TUnixLinuxLocalAccountRotationInput,
  TUnixLinuxLocalAccountRotationListItem,
  TUnixLinuxLocalAccountRotationWithConnection
} from "./unix-linux-local-account-rotation";
import {
  TWindowsLocalAccountRotation,
  TWindowsLocalAccountRotationGeneratedCredentials,
  TWindowsLocalAccountRotationInput,
  TWindowsLocalAccountRotationListItem,
  TWindowsLocalAccountRotationWithConnection
} from "./windows-local-account-rotation";

export type TSecretRotationV2 =
  | TPostgresCredentialsRotation
  | TMsSqlCredentialsRotation
  | TMySqlCredentialsRotation
  | TOracleDBCredentialsRotation
  | TAuth0ClientSecretRotation
  | TAzureClientSecretRotation
  | TLdapPasswordRotation
  | TAwsIamUserSecretRotation
  | TOktaClientSecretRotation
  | TRedisCredentialsRotation
  | TMongoDBCredentialsRotation
  | TDatabricksServicePrincipalSecretRotation
  | TUnixLinuxLocalAccountRotation
  | TWindowsLocalAccountRotation;

export type TSecretRotationV2WithConnection =
  | TPostgresCredentialsRotationWithConnection
  | TMsSqlCredentialsRotationWithConnection
  | TMySqlCredentialsRotationWithConnection
  | TOracleDBCredentialsRotationWithConnection
  | TAuth0ClientSecretRotationWithConnection
  | TAzureClientSecretRotationWithConnection
  | TLdapPasswordRotationWithConnection
  | TAwsIamUserSecretRotationWithConnection
  | TOktaClientSecretRotationWithConnection
  | TRedisCredentialsRotationWithConnection
  | TMongoDBCredentialsRotationWithConnection
  | TDatabricksServicePrincipalSecretRotationWithConnection
  | TUnixLinuxLocalAccountRotationWithConnection
  | TWindowsLocalAccountRotationWithConnection;

export type TSecretRotationV2GeneratedCredentials =
  | TSqlCredentialsRotationGeneratedCredentials
  | TAuth0ClientSecretRotationGeneratedCredentials
  | TAzureClientSecretRotationGeneratedCredentials
  | TLdapPasswordRotationGeneratedCredentials
  | TAwsIamUserSecretRotationGeneratedCredentials
  | TOktaClientSecretRotationGeneratedCredentials
  | TRedisCredentialsRotationGeneratedCredentials
  | TDatabricksServicePrincipalSecretRotationGeneratedCredentials
  | TUnixLinuxLocalAccountRotationGeneratedCredentials
  | TWindowsLocalAccountRotationGeneratedCredentials;

export type TSecretRotationV2Input =
  | TPostgresCredentialsRotationInput
  | TMsSqlCredentialsRotationInput
  | TMySqlCredentialsRotationInput
  | TOracleDBCredentialsRotationInput
  | TAuth0ClientSecretRotationInput
  | TAzureClientSecretRotationInput
  | TLdapPasswordRotationInput
  | TAwsIamUserSecretRotationInput
  | TOktaClientSecretRotationInput
  | TRedisCredentialsRotationInput
  | TMongoDBCredentialsRotationInput
  | TDatabricksServicePrincipalSecretRotationInput
  | TUnixLinuxLocalAccountRotationInput
  | TWindowsLocalAccountRotationInput;

export type TSecretRotationV2ListItem =
  | TPostgresCredentialsRotationListItem
  | TMsSqlCredentialsRotationListItem
  | TMySqlCredentialsRotationListItem
  | TOracleDBCredentialsRotationListItem
  | TAuth0ClientSecretRotationListItem
  | TAzureClientSecretRotationListItem
  | TLdapPasswordRotationListItem
  | TAwsIamUserSecretRotationListItem
  | TOktaClientSecretRotationListItem
  | TRedisCredentialsRotationListItem
  | TMongoDBCredentialsRotationListItem
  | TDatabricksServicePrincipalSecretRotationListItem
  | TUnixLinuxLocalAccountRotationListItem
  | TWindowsLocalAccountRotationListItem;

export type TSecretRotationV2TemporaryParameters =
  | TLdapPasswordRotationInput["temporaryParameters"]
  | TUnixLinuxLocalAccountRotationInput["temporaryParameters"]
  | TWindowsLocalAccountRotationInput["temporaryParameters"]
  | undefined;

export type TSecretRotationV2Raw = NonNullable<Awaited<ReturnType<TSecretRotationV2DALFactory["findById"]>>>;

export type TListSecretRotationsV2ByProjectId = {
  projectId: string;
  type?: SecretRotation;
};

export type TFindSecretRotationV2ByIdDTO = {
  rotationId: string;
  type: SecretRotation;
};

export type TRotateSecretRotationV2 = TFindSecretRotationV2ByIdDTO & { auditLogInfo: AuditLogInfo };

export type TRotateAtUtc = { hours: number; minutes: number };

export type TFindSecretRotationV2ByNameDTO = {
  rotationName: string;
  secretPath: string;
  environment: string;
  projectId: string;
  type: SecretRotation;
};

export type TCreateSecretRotationV2DTO = Pick<
  TSecretRotationV2,
  "parameters" | "secretsMapping" | "description" | "rotationInterval" | "name" | "connectionId" | "projectId"
> & {
  type: SecretRotation;
  secretPath: string;
  environment: string;
  isAutoRotationEnabled?: boolean;
  rotateAtUtc?: TRotateAtUtc;
  temporaryParameters?: TSecretRotationV2TemporaryParameters;
};

export type TUpdateSecretRotationV2DTO = Partial<
  Omit<TCreateSecretRotationV2DTO, "projectId" | "connectionId" | "secretPath" | "environment">
> & {
  rotationId: string;
  type: SecretRotation;
};

export type TDeleteSecretRotationV2DTO = {
  type: SecretRotation;
  rotationId: string;
  deleteSecrets: boolean;
  revokeGeneratedCredentials: boolean;
};

export type TGetDashboardSecretRotationV2Count = {
  search?: string;
  projectId: string;
  secretPath: string;
  environments: string[];
};

export type TGetDashboardSecretRotationsV2 = {
  search?: string;
  projectId: string;
  secretPath: string;
  environments: string[];
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  limit: number;
  offset: number;
};

export type TQuickSearchSecretRotationsV2Filters = {
  offset?: number;
  limit?: number;
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TQuickSearchSecretRotationsV2 = {
  projectId: string;
  folderMappings: { folderId: string; path: string; environment: string }[];
  filters: TQuickSearchSecretRotationsV2Filters;
};

export type TSecretRotationRotateGeneratedCredentials = {
  auditLogInfo?: AuditLogInfo;
  jobId?: string;
  shouldSendNotification?: boolean;
  isFinalAttempt?: boolean;
  isManualRotation?: boolean;
};

export type TSecretRotationRotateSecretsJobPayload = { rotationId: string; queuedAt: Date; isManualRotation: boolean };

export type TSecretRotationSendNotificationJobPayload = {
  secretRotation: TSecretRotationV2Raw;
};

// scott: the reason for the callback structure of the rotation factory is to facilitate, when possible,
// transactional behavior. By passing in the rotation mutation, if this mutation fails we can roll back the
// third party credential changes (when supported), preventing credentials getting out of sync

export type TRotationFactoryIssueCredentials<
  T extends TSecretRotationV2GeneratedCredentials,
  P extends TSecretRotationV2TemporaryParameters = undefined
> = (
  callback: (newCredentials: T[number]) => Promise<TSecretRotationV2Raw>,
  temporaryParameters?: P
) => Promise<TSecretRotationV2Raw>;

export type TRotationFactoryRevokeCredentials<T extends TSecretRotationV2GeneratedCredentials> = (
  generatedCredentials: T,
  callback: () => Promise<TSecretRotationV2Raw>
) => Promise<TSecretRotationV2Raw>;

export type TRotationFactoryRotateCredentials<T extends TSecretRotationV2GeneratedCredentials> = (
  credentialsToRevoke: T[number] | undefined,
  callback: (newCredentials: T[number]) => Promise<TSecretRotationV2Raw>,
  activeCredentials: T[number]
) => Promise<TSecretRotationV2Raw>;

export type TRotationFactoryGetSecretsPayload<T extends TSecretRotationV2GeneratedCredentials> = (
  generatedCredentials: T[number]
) => { key: string; value: string }[];

export type TRotationFactory<
  T extends TSecretRotationV2WithConnection,
  C extends TSecretRotationV2GeneratedCredentials,
  P extends TSecretRotationV2TemporaryParameters = undefined
> = (
  secretRotation: T,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update" | "updateById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  issueCredentials: TRotationFactoryIssueCredentials<C, P>;
  revokeCredentials: TRotationFactoryRevokeCredentials<C>;
  rotateCredentials: TRotationFactoryRotateCredentials<C>;
  getSecretsPayload: TRotationFactoryGetSecretsPayload<C>;
};
