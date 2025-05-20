import { ForbiddenError, subject } from "@casl/ability";

import { OrgPermissionAppConnectionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { generateHash } from "@app/lib/crypto/encryption";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { DiscriminativePick, OrgServiceActor } from "@app/lib/types";
import {
  decryptAppConnection,
  encryptAppConnectionCredentials,
  getAppConnectionMethodName,
  listAppConnectionOptions,
  TRANSITION_CONNECTION_CREDENTIALS_TO_PLATFORM,
  validateAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { auth0ConnectionService } from "@app/services/app-connection/auth0/auth0-connection-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "./app-connection-dal";
import { AppConnection } from "./app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "./app-connection-maps";
import {
  TAppConnection,
  TAppConnectionConfig,
  TAppConnectionRaw,
  TCreateAppConnectionDTO,
  TUpdateAppConnectionDTO,
  TValidateAppConnectionCredentialsSchema
} from "./app-connection-types";
import { ValidateAuth0ConnectionCredentialsSchema } from "./auth0";
import { ValidateAwsConnectionCredentialsSchema } from "./aws";
import { awsConnectionService } from "./aws/aws-connection-service";
import { ValidateAzureAppConfigurationConnectionCredentialsSchema } from "./azure-app-configuration";
import { ValidateAzureClientSecretsConnectionCredentialsSchema } from "./azure-client-secrets";
import { azureClientSecretsConnectionService } from "./azure-client-secrets/azure-client-secrets-service";
import { ValidateAzureKeyVaultConnectionCredentialsSchema } from "./azure-key-vault";
import { ValidateCamundaConnectionCredentialsSchema } from "./camunda";
import { camundaConnectionService } from "./camunda/camunda-connection-service";
import { ValidateDatabricksConnectionCredentialsSchema } from "./databricks";
import { databricksConnectionService } from "./databricks/databricks-connection-service";
import { ValidateGcpConnectionCredentialsSchema } from "./gcp";
import { gcpConnectionService } from "./gcp/gcp-connection-service";
import { ValidateGitHubConnectionCredentialsSchema } from "./github";
import { githubConnectionService } from "./github/github-connection-service";
import { ValidateHCVaultConnectionCredentialsSchema } from "./hc-vault";
import { hcVaultConnectionService } from "./hc-vault/hc-vault-connection-service";
import { ValidateHumanitecConnectionCredentialsSchema } from "./humanitec";
import { humanitecConnectionService } from "./humanitec/humanitec-connection-service";
import { ValidateLdapConnectionCredentialsSchema } from "./ldap";
import { ValidateMsSqlConnectionCredentialsSchema } from "./mssql";
import { ValidateOCIConnectionCredentialsSchema } from "./oci";
import { ociConnectionService } from "./oci/oci-connection-service";
import { ValidatePostgresConnectionCredentialsSchema } from "./postgres";
import { ValidateTeamCityConnectionCredentialsSchema } from "./teamcity";
import { teamcityConnectionService } from "./teamcity/teamcity-connection-service";
import { ValidateTerraformCloudConnectionCredentialsSchema } from "./terraform-cloud";
import { terraformCloudConnectionService } from "./terraform-cloud/terraform-cloud-connection-service";
import { ValidateVercelConnectionCredentialsSchema } from "./vercel";
import { vercelConnectionService } from "./vercel/vercel-connection-service";
import { ValidateWindmillConnectionCredentialsSchema } from "./windmill";
import { windmillConnectionService } from "./windmill/windmill-connection-service";

export type TAppConnectionServiceFactoryDep = {
  appConnectionDAL: TAppConnectionDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAppConnectionServiceFactory = ReturnType<typeof appConnectionServiceFactory>;

const VALIDATE_APP_CONNECTION_CREDENTIALS_MAP: Record<AppConnection, TValidateAppConnectionCredentialsSchema> = {
  [AppConnection.AWS]: ValidateAwsConnectionCredentialsSchema,
  [AppConnection.GitHub]: ValidateGitHubConnectionCredentialsSchema,
  [AppConnection.GCP]: ValidateGcpConnectionCredentialsSchema,
  [AppConnection.AzureKeyVault]: ValidateAzureKeyVaultConnectionCredentialsSchema,
  [AppConnection.AzureAppConfiguration]: ValidateAzureAppConfigurationConnectionCredentialsSchema,
  [AppConnection.Databricks]: ValidateDatabricksConnectionCredentialsSchema,
  [AppConnection.Humanitec]: ValidateHumanitecConnectionCredentialsSchema,
  [AppConnection.TerraformCloud]: ValidateTerraformCloudConnectionCredentialsSchema,
  [AppConnection.Vercel]: ValidateVercelConnectionCredentialsSchema,
  [AppConnection.Postgres]: ValidatePostgresConnectionCredentialsSchema,
  [AppConnection.MsSql]: ValidateMsSqlConnectionCredentialsSchema,
  [AppConnection.Camunda]: ValidateCamundaConnectionCredentialsSchema,
  [AppConnection.AzureClientSecrets]: ValidateAzureClientSecretsConnectionCredentialsSchema,
  [AppConnection.Windmill]: ValidateWindmillConnectionCredentialsSchema,
  [AppConnection.Auth0]: ValidateAuth0ConnectionCredentialsSchema,
  [AppConnection.HCVault]: ValidateHCVaultConnectionCredentialsSchema,
  [AppConnection.LDAP]: ValidateLdapConnectionCredentialsSchema,
  [AppConnection.TeamCity]: ValidateTeamCityConnectionCredentialsSchema,
  [AppConnection.OCI]: ValidateOCIConnectionCredentialsSchema
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

    try {
      const createConnection = async (connectionCredentials: TAppConnection["credentials"]) => {
        const encryptedCredentials = await encryptAppConnectionCredentials({
          credentials: connectionCredentials,
          orgId: actor.orgId,
          kmsService
        });

        return appConnectionDAL.create({
          orgId: actor.orgId,
          encryptedCredentials,
          method,
          app,
          ...params
        });
      };

      let connection: TAppConnectionRaw;

      if (params.isPlatformManagedCredentials) {
        connection = await TRANSITION_CONNECTION_CREDENTIALS_TO_PLATFORM[app](
          {
            app,
            orgId: actor.orgId,
            credentials: validatedCredentials,
            method
          } as TAppConnectionConfig,
          (platformCredentials) => createConnection(platformCredentials)
        );
      } else {
        connection = await createConnection(validatedCredentials);
      }

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

    // prevent updating credentials or management status if platform managed
    if (appConnection.isPlatformManagedCredentials && (params.isPlatformManagedCredentials === false || credentials)) {
      throw new BadRequestError({
        message: "Cannot update credentials or management status for platform managed connections"
      });
    }

    let updatedCredentials: undefined | TAppConnection["credentials"];

    const { app, method } = appConnection as DiscriminativePick<TAppConnectionConfig, "app" | "method">;

    if (credentials) {
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

      updatedCredentials = await validateAppConnectionCredentials({
        app,
        orgId: actor.orgId,
        credentials,
        method
      } as TAppConnectionConfig);

      if (!updatedCredentials)
        throw new BadRequestError({ message: "Unable to validate connection - check credentials" });
    }

    try {
      const updateConnection = async (connectionCredentials: TAppConnection["credentials"] | undefined) => {
        const encryptedCredentials = connectionCredentials
          ? await encryptAppConnectionCredentials({
              credentials: connectionCredentials,
              orgId: actor.orgId,
              kmsService
            })
          : undefined;

        return appConnectionDAL.updateById(connectionId, {
          orgId: actor.orgId,
          encryptedCredentials,
          ...params
        });
      };

      let updatedConnection: TAppConnectionRaw;

      if (params.isPlatformManagedCredentials) {
        if (!updatedCredentials)
          // prevent enabling platform managed credentials without re-confirming credentials
          throw new BadRequestError({ message: "Credentials required to transition to platform managed credentials" });

        updatedConnection = await TRANSITION_CONNECTION_CREDENTIALS_TO_PLATFORM[app](
          {
            app,
            orgId: actor.orgId,
            credentials: updatedCredentials,
            method
          } as TAppConnectionConfig,
          (platformCredentials) => updateConnection(platformCredentials)
        );
      } else {
        updatedConnection = await updateConnection(updatedCredentials);
      }

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
    humanitec: humanitecConnectionService(connectAppConnectionById),
    terraformCloud: terraformCloudConnectionService(connectAppConnectionById),
    camunda: camundaConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    vercel: vercelConnectionService(connectAppConnectionById),
    azureClientSecrets: azureClientSecretsConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    auth0: auth0ConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    hcvault: hcVaultConnectionService(connectAppConnectionById),
    windmill: windmillConnectionService(connectAppConnectionById),
    teamcity: teamcityConnectionService(connectAppConnectionById),
    oci: ociConnectionService(connectAppConnectionById)
  };
};
