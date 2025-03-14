import { ForbiddenError, subject } from "@casl/ability";

import { OrgPermissionAppConnectionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { generateHash } from "@app/lib/crypto/encryption";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { DiscriminativePick, OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  decryptAppConnection,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName,
  listAppConnectionOptions,
  validateAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import {
  TAppConnection,
  TAppConnectionConfig,
  TCreateAppConnectionDTO,
  TUpdateAppConnectionDTO,
  TValidateAppConnectionCredentials
} from "@app/services/app-connection/app-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "./app-connection-dal";
import { ValidateAwsConnectionCredentialsSchema } from "./aws";
import { awsConnectionService } from "./aws/aws-connection-service";
import { ValidateAzureAppConfigurationConnectionCredentialsSchema } from "./azure-app-configuration";
import { ValidateAzureKeyVaultConnectionCredentialsSchema } from "./azure-key-vault";
import { ValidateDatabricksConnectionCredentialsSchema } from "./databricks";
import { databricksConnectionService } from "./databricks/databricks-connection-service";
import { ValidateGcpConnectionCredentialsSchema } from "./gcp";
import { gcpConnectionService } from "./gcp/gcp-connection-service";
import { ValidateGitHubConnectionCredentialsSchema } from "./github";
import { githubConnectionService } from "./github/github-connection-service";
import { ValidateHumanitecConnectionCredentialsSchema } from "./humanitec";
import { humanitecConnectionService } from "./humanitec/humanitec-connection-service";

export type TAppConnectionServiceFactoryDep = {
  appConnectionDAL: TAppConnectionDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAppConnectionServiceFactory = ReturnType<typeof appConnectionServiceFactory>;

const VALIDATE_APP_CONNECTION_CREDENTIALS_MAP: Record<AppConnection, TValidateAppConnectionCredentials> = {
  [AppConnection.AWS]: ValidateAwsConnectionCredentialsSchema,
  [AppConnection.GitHub]: ValidateGitHubConnectionCredentialsSchema,
  [AppConnection.GCP]: ValidateGcpConnectionCredentialsSchema,
  [AppConnection.AzureKeyVault]: ValidateAzureKeyVaultConnectionCredentialsSchema,
  [AppConnection.AzureAppConfiguration]: ValidateAzureAppConfigurationConnectionCredentialsSchema,
  [AppConnection.Databricks]: ValidateDatabricksConnectionCredentialsSchema,
  [AppConnection.Humanitec]: ValidateHumanitecConnectionCredentialsSchema
};

export const appConnectionServiceFactory = ({
  appConnectionDAL,
  permissionService,
  kmsService
}: TAppConnectionServiceFactoryDep) => {
  const listAppConnectionsByOrg = async (actor: OrgServiceActor, app?: AppConnection) => {
    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Read,
      OrgPermissionSubjects.AppConnections
    );

    const appConnections = await appConnectionDAL.find(
      app
        ? { orgId: actor.orgId, app }
        : {
            orgId: actor.orgId
          }
    );

    return Promise.all(
      appConnections
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
        .map((appConnection) => decryptAppConnection(appConnection, kmsService))
    );
  };

  const findAppConnectionById = async (app: AppConnection, connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Read,
      OrgPermissionSubjects.AppConnections
    );

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    return decryptAppConnection(appConnection, kmsService);
  };

  const findAppConnectionByName = async (app: AppConnection, connectionName: string, actor: OrgServiceActor) => {
    const appConnection = await appConnectionDAL.findOne({ name: connectionName, orgId: actor.orgId });

    if (!appConnection)
      throw new NotFoundError({ message: `Could not find App Connection with name ${connectionName}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Read,
      OrgPermissionSubjects.AppConnections
    );

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with name ${connectionName} is not for App "${app}"` });

    return decryptAppConnection(appConnection, kmsService);
  };

  const createAppConnection = async (
    { method, app, credentials, ...params }: TCreateAppConnectionDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Create,
      OrgPermissionSubjects.AppConnections
    );

    const validatedCredentials = await validateAppConnectionCredentials({
      app,
      credentials,
      method,
      orgId: actor.orgId
    } as TAppConnectionConfig);

    const encryptedCredentials = await encryptAppConnectionCredentials({
      credentials: validatedCredentials,
      orgId: actor.orgId,
      kmsService
    });

    try {
      const connection = await appConnectionDAL.create({
        orgId: actor.orgId,
        encryptedCredentials,
        method,
        app,
        ...params
      });

      return {
        ...connection,
        credentialsHash: generateHash(connection.encryptedCredentials),
        credentials: validatedCredentials
      } as TAppConnection;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `An App Connection with the name "${params.name}" already exists` });
      }

      throw err;
    }
  };

  const updateAppConnection = async (
    { connectionId, credentials, ...params }: TUpdateAppConnectionDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Edit,
      OrgPermissionSubjects.AppConnections
    );

    let encryptedCredentials: undefined | Buffer;

    if (credentials) {
      const { app, method } = appConnection as DiscriminativePick<TAppConnectionConfig, "app" | "method">;

      if (
        !VALIDATE_APP_CONNECTION_CREDENTIALS_MAP[app].safeParse({
          method,
          credentials
        }).success
      )
        throw new BadRequestError({
          message: `Invalid credential format for ${
            APP_CONNECTION_NAME_MAP[app]
          } Connection with method ${getAppConnectionMethodName(method)}`
        });

      const validatedCredentials = await validateAppConnectionCredentials({
        app,
        orgId: actor.orgId,
        credentials,
        method
      } as TAppConnectionConfig);

      if (!validatedCredentials)
        throw new BadRequestError({ message: "Unable to validate connection - check credentials" });

      encryptedCredentials = await encryptAppConnectionCredentials({
        credentials: validatedCredentials,
        orgId: actor.orgId,
        kmsService
      });
    }

    try {
      const updatedConnection = await appConnectionDAL.updateById(connectionId, {
        orgId: actor.orgId,
        encryptedCredentials,
        ...params
      });

      return await decryptAppConnection(updatedConnection, kmsService);
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `An App Connection with the name "${params.name}" already exists` });
      }

      throw err;
    }
  };

  const deleteAppConnection = async (app: AppConnection, connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Delete,
      OrgPermissionSubjects.AppConnections
    );

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    // TODO (scott): add option to delete all dependencies

    try {
      const deletedAppConnection = await appConnectionDAL.deleteById(connectionId);

      return await decryptAppConnection(deletedAppConnection, kmsService);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code: string })?.code === DatabaseErrorCode.ForeignKeyViolation
      ) {
        throw new BadRequestError({
          message:
            "Cannot delete App Connection with existing connections. Remove all existing connections and try again."
        });
      }

      throw err;
    }
  };

  const connectAppConnectionById = async <T extends TAppConnection>(
    app: AppConnection,
    connectionId: string,
    actor: OrgServiceActor
  ) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission: orgPermission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      appConnection.orgId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Connect,
      subject(OrgPermissionSubjects.AppConnections, { connectionId: appConnection.id })
    );

    if (appConnection.app !== app)
      throw new BadRequestError({
        message: `${
          APP_CONNECTION_NAME_MAP[appConnection.app as AppConnection]
        } Connection with ID ${connectionId} cannot be used to connect to ${APP_CONNECTION_NAME_MAP[app]}`
      });

    const connection = await decryptAppConnection(appConnection, kmsService);

    return connection as T;
  };

  const listAvailableAppConnectionsForUser = async (app: AppConnection, actor: OrgServiceActor) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    const appConnections = await appConnectionDAL.find({ app, orgId: actor.orgId });

    const availableConnections = appConnections.filter((connection) =>
      orgPermission.can(
        OrgPermissionAppConnectionActions.Connect,
        subject(OrgPermissionSubjects.AppConnections, { connectionId: connection.id })
      )
    );

    return availableConnections as Omit<TAppConnection, "credentials">[];
  };

  return {
    listAppConnectionOptions,
    listAppConnectionsByOrg,
    findAppConnectionById,
    findAppConnectionByName,
    createAppConnection,
    updateAppConnection,
    deleteAppConnection,
    connectAppConnectionById,
    listAvailableAppConnectionsForUser,
    github: githubConnectionService(connectAppConnectionById),
    gcp: gcpConnectionService(connectAppConnectionById),
    databricks: databricksConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    aws: awsConnectionService(connectAppConnectionById),
    humanitec: humanitecConnectionService(connectAppConnectionById)
  };
};
