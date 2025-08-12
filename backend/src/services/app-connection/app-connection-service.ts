import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, OrgMembershipRole, TAppConnections } from "@app/db/schemas";
import { ValidateOCIConnectionCredentialsSchema } from "@app/ee/services/app-connections/oci";
import { ociConnectionService } from "@app/ee/services/app-connections/oci/oci-connection-service";
import { ValidateOracleDBConnectionCredentialsSchema } from "@app/ee/services/app-connections/oracledb";
import { TGatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionGatewayActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { TSecretScanningV2DALFactory } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-dal";
import { crypto } from "@app/lib/crypto/cryptography";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { DiscriminativePick, OrgServiceActor } from "@app/lib/types";
import {
  decryptAppConnection,
  encryptAppConnectionCredentials,
  enterpriseAppCheck,
  getAppConnectionMethodName,
  listAppConnectionOptions,
  TRANSITION_CONNECTION_CREDENTIALS_TO_PLATFORM,
  validateAppConnectionCredentials
} from "@app/services/app-connection/app-connection-fns";
import { auth0ConnectionService } from "@app/services/app-connection/auth0/auth0-connection-service";
import {
  githubRadarConnectionService
} from "@app/services/app-connection/github-radar/github-radar-connection-service";
import {
  TExternalCertificateAuthorityDALFactory
} from "@app/services/certificate-authority/external-certificate-authority-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretSyncDALFactory } from "@app/services/secret-sync/secret-sync-dal";

import { ValidateOnePassConnectionCredentialsSchema } from "./1password";
import { onePassConnectionService } from "./1password/1password-connection-service";
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
import { ValidateAzureDevOpsConnectionCredentialsSchema } from "./azure-devops/azure-devops-schemas";
import { azureDevOpsConnectionService } from "./azure-devops/azure-devops-service";
import { ValidateAzureKeyVaultConnectionCredentialsSchema } from "./azure-key-vault";
import { ValidateBitbucketConnectionCredentialsSchema } from "./bitbucket";
import { bitbucketConnectionService } from "./bitbucket/bitbucket-connection-service";
import { ValidateCamundaConnectionCredentialsSchema } from "./camunda";
import { camundaConnectionService } from "./camunda/camunda-connection-service";
import { ValidateChecklyConnectionCredentialsSchema } from "./checkly";
import { checklyConnectionService } from "./checkly/checkly-connection-service";
import { ValidateCloudflareConnectionCredentialsSchema } from "./cloudflare/cloudflare-connection-schema";
import { cloudflareConnectionService } from "./cloudflare/cloudflare-connection-service";
import { ValidateDatabricksConnectionCredentialsSchema } from "./databricks";
import { databricksConnectionService } from "./databricks/databricks-connection-service";
import { ValidateDigitalOceanConnectionCredentialsSchema } from "./digital-ocean";
import { digitalOceanAppPlatformConnectionService } from "./digital-ocean/digital-ocean-connection-service";
import { ValidateFlyioConnectionCredentialsSchema } from "./flyio";
import { flyioConnectionService } from "./flyio/flyio-connection-service";
import { ValidateGcpConnectionCredentialsSchema } from "./gcp";
import { gcpConnectionService } from "./gcp/gcp-connection-service";
import { ValidateGitHubConnectionCredentialsSchema } from "./github";
import { githubConnectionService } from "./github/github-connection-service";
import { ValidateGitHubRadarConnectionCredentialsSchema } from "./github-radar";
import { ValidateGitLabConnectionCredentialsSchema } from "./gitlab";
import { gitlabConnectionService } from "./gitlab/gitlab-connection-service";
import { ValidateHCVaultConnectionCredentialsSchema } from "./hc-vault";
import { hcVaultConnectionService } from "./hc-vault/hc-vault-connection-service";
import { ValidateHerokuConnectionCredentialsSchema } from "./heroku";
import { herokuConnectionService } from "./heroku/heroku-connection-service";
import { ValidateHumanitecConnectionCredentialsSchema } from "./humanitec";
import { humanitecConnectionService } from "./humanitec/humanitec-connection-service";
import { ValidateLdapConnectionCredentialsSchema } from "./ldap";
import { ValidateMsSqlConnectionCredentialsSchema } from "./mssql";
import { ValidateMySqlConnectionCredentialsSchema } from "./mysql";
import { ValidateNetlifyConnectionCredentialsSchema } from "./netlify";
import { netlifyConnectionService } from "./netlify/netlify-connection-service";
import { ValidateOktaConnectionCredentialsSchema } from "./okta";
import { oktaConnectionService } from "./okta/okta-connection-service";
import { ValidatePostgresConnectionCredentialsSchema } from "./postgres";
import { ValidateRailwayConnectionCredentialsSchema } from "./railway";
import { railwayConnectionService } from "./railway/railway-connection-service";
import { ValidateRenderConnectionCredentialsSchema } from "./render/render-connection-schema";
import { renderConnectionService } from "./render/render-connection-service";
import { ValidateSupabaseConnectionCredentialsSchema } from "./supabase";
import { supabaseConnectionService } from "./supabase/supabase-connection-service";
import { ValidateTeamCityConnectionCredentialsSchema } from "./teamcity";
import { teamcityConnectionService } from "./teamcity/teamcity-connection-service";
import { ValidateTerraformCloudConnectionCredentialsSchema } from "./terraform-cloud";
import { terraformCloudConnectionService } from "./terraform-cloud/terraform-cloud-connection-service";
import { ValidateVercelConnectionCredentialsSchema } from "./vercel";
import { vercelConnectionService } from "./vercel/vercel-connection-service";
import { ValidateWindmillConnectionCredentialsSchema } from "./windmill";
import { windmillConnectionService } from "./windmill/windmill-connection-service";
import { ValidateZabbixConnectionCredentialsSchema } from "./zabbix";
import { zabbixConnectionService } from "./zabbix/zabbix-connection-service";

export type TAppConnectionServiceFactoryDep = {
  appConnectionDAL: TAppConnectionDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">;
  gatewayDAL: Pick<TGatewayDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findProjectById">;
  secretSyncDAL: Pick<TSecretSyncDALFactory, "update">;
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "update">;
  secretScanningV2DAL: Pick<TSecretScanningV2DALFactory, "dataSources">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "update">;
};

export type TAppConnectionServiceFactory = ReturnType<typeof appConnectionServiceFactory>;

const VALIDATE_APP_CONNECTION_CREDENTIALS_MAP: Record<AppConnection, TValidateAppConnectionCredentialsSchema> = {
  [AppConnection.AWS]: ValidateAwsConnectionCredentialsSchema,
  [AppConnection.GitHub]: ValidateGitHubConnectionCredentialsSchema,
  [AppConnection.GitHubRadar]: ValidateGitHubRadarConnectionCredentialsSchema,
  [AppConnection.GCP]: ValidateGcpConnectionCredentialsSchema,
  [AppConnection.AzureKeyVault]: ValidateAzureKeyVaultConnectionCredentialsSchema,
  [AppConnection.AzureAppConfiguration]: ValidateAzureAppConfigurationConnectionCredentialsSchema,
  [AppConnection.AzureDevOps]: ValidateAzureDevOpsConnectionCredentialsSchema,
  [AppConnection.Databricks]: ValidateDatabricksConnectionCredentialsSchema,
  [AppConnection.Humanitec]: ValidateHumanitecConnectionCredentialsSchema,
  [AppConnection.TerraformCloud]: ValidateTerraformCloudConnectionCredentialsSchema,
  [AppConnection.Vercel]: ValidateVercelConnectionCredentialsSchema,
  [AppConnection.Postgres]: ValidatePostgresConnectionCredentialsSchema,
  [AppConnection.MsSql]: ValidateMsSqlConnectionCredentialsSchema,
  [AppConnection.MySql]: ValidateMySqlConnectionCredentialsSchema,
  [AppConnection.Camunda]: ValidateCamundaConnectionCredentialsSchema,
  [AppConnection.AzureClientSecrets]: ValidateAzureClientSecretsConnectionCredentialsSchema,
  [AppConnection.Windmill]: ValidateWindmillConnectionCredentialsSchema,
  [AppConnection.Auth0]: ValidateAuth0ConnectionCredentialsSchema,
  [AppConnection.HCVault]: ValidateHCVaultConnectionCredentialsSchema,
  [AppConnection.LDAP]: ValidateLdapConnectionCredentialsSchema,
  [AppConnection.TeamCity]: ValidateTeamCityConnectionCredentialsSchema,
  [AppConnection.OCI]: ValidateOCIConnectionCredentialsSchema,
  [AppConnection.OracleDB]: ValidateOracleDBConnectionCredentialsSchema,
  [AppConnection.OnePass]: ValidateOnePassConnectionCredentialsSchema,
  [AppConnection.Heroku]: ValidateHerokuConnectionCredentialsSchema,
  [AppConnection.Render]: ValidateRenderConnectionCredentialsSchema,
  [AppConnection.Flyio]: ValidateFlyioConnectionCredentialsSchema,
  [AppConnection.GitLab]: ValidateGitLabConnectionCredentialsSchema,
  [AppConnection.Cloudflare]: ValidateCloudflareConnectionCredentialsSchema,
  [AppConnection.Zabbix]: ValidateZabbixConnectionCredentialsSchema,
  [AppConnection.Railway]: ValidateRailwayConnectionCredentialsSchema,
  [AppConnection.Bitbucket]: ValidateBitbucketConnectionCredentialsSchema,
  [AppConnection.Checkly]: ValidateChecklyConnectionCredentialsSchema,
  [AppConnection.Supabase]: ValidateSupabaseConnectionCredentialsSchema,
  [AppConnection.DigitalOcean]: ValidateDigitalOceanConnectionCredentialsSchema,
  [AppConnection.Netlify]: ValidateNetlifyConnectionCredentialsSchema,
  [AppConnection.Okta]: ValidateOktaConnectionCredentialsSchema
};

export const appConnectionServiceFactory = ({
  appConnectionDAL,
  permissionService,
  kmsService,
  licenseService,
  gatewayService,
  gatewayDAL,
  projectDAL,
  secretSyncDAL,
  secretRotationV2DAL,
  secretScanningV2DAL,
  externalCertificateAuthorityDAL
}: TAppConnectionServiceFactoryDep) => {
  const listAppConnections = async (actor: OrgServiceActor, app?: AppConnection, projectId?: string) => {
    let appConnections: TAppConnections[];

    if (projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAppConnectionActions.Read,
        ProjectPermissionSub.AppConnections
      );

      appConnections = (
        await appConnectionDAL.find({
          projectId,
          ...(app ? { app } : {})
        })
      ).filter((appConnection) =>
        permission.can(
          ProjectPermissionAppConnectionActions.Read,
          subject(ProjectPermissionSub.AppConnections, { connectionId: appConnection.id })
        )
      );
    } else {
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

      appConnections = (
        await appConnectionDAL.find({
          orgId: actor.orgId,
          projectId: null,
          ...(app ? { app } : {})
        })
      ).filter((appConnection) =>
        permission.can(
          OrgPermissionAppConnectionActions.Read,
          subject(OrgPermissionSubjects.AppConnections, { connectionId: appConnection.id })
        )
      );
    }

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
    { method, app, credentials, gatewayId, projectId, ...params }: TCreateAppConnectionDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionSub.AppConnections
    );

    const project = await projectDAL.findProjectById(projectId);

    if (!project) throw new BadRequestError({ message: `Could not find project with ID ${projectId}` });

    if (gatewayId) {
      const { permission: orgPermission } = await permissionService.getOrgPermission(
        actor.type,
        actor.id,
        actor.orgId,
        actor.authMethod,
        actor.orgId
      );

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: actor.orgId });
      if (!gateway) {
        throw new NotFoundError({
          message: `Gateway with ID ${gatewayId} not found for org`
        });
      }
    }

    await enterpriseAppCheck(
      licenseService,
      app,
      actor.orgId,
      "Failed to create app connection due to plan restriction. Upgrade plan to access enterprise app connections."
    );

    const validatedCredentials = await validateAppConnectionCredentials(
      {
        app,
        credentials,
        method,
        orgId: actor.orgId,
        gatewayId
      } as TAppConnectionConfig,
      gatewayService
    );

    try {
      const createConnection = async (connectionCredentials: TAppConnection["credentials"]) => {
        const encryptedCredentials = await encryptAppConnectionCredentials({
          credentials: connectionCredentials,
          orgId: actor.orgId,
          kmsService,
          projectId
        });

        return appConnectionDAL.create({
          orgId: actor.orgId,
          encryptedCredentials,
          method,
          app,
          gatewayId,
          projectId,
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
            method,
            gatewayId
          } as TAppConnectionConfig,
          (platformCredentials) => createConnection(platformCredentials),
          gatewayService
        );
      } else {
        connection = await createConnection(validatedCredentials);
      }

      return {
        ...connection,
        credentialsHash: crypto.nativeCrypto.createHash("sha256").update(connection.encryptedCredentials).digest("hex"),
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
    { connectionId, credentials, gatewayId, ...params }: TUpdateAppConnectionDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    await enterpriseAppCheck(
      licenseService,
      appConnection.app as AppConnection,
      actor.orgId,
      "Failed to update app connection due to plan restriction. Upgrade plan to access enterprise app connections."
    );

    const { permission: orgPermission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      appConnection.orgId
    );

    if (appConnection.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId: appConnection.projectId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAppConnectionActions.Edit,
        subject(ProjectPermissionSub.AppConnections, { connectionId: appConnection.id })
      );
    } else {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Edit,
        subject(OrgPermissionSubjects.AppConnections, { connectionId: appConnection.id })
      );
    }

    if (gatewayId !== undefined && gatewayId !== appConnection.gatewayId) {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      if (gatewayId) {
        const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: actor.orgId });
        if (!gateway) {
          throw new NotFoundError({
            message: `Gateway with ID ${gatewayId} not found for org`
          });
        }
      }
    }

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

      updatedCredentials = await validateAppConnectionCredentials(
        {
          app,
          orgId: actor.orgId,
          credentials,
          method,
          gatewayId
        } as TAppConnectionConfig,
        gatewayService
      );

      if (!updatedCredentials)
        throw new BadRequestError({ message: "Unable to validate connection - check credentials" });
    }

    try {
      const updateConnection = async (connectionCredentials: TAppConnection["credentials"] | undefined) => {
        const encryptedCredentials = connectionCredentials
          ? await encryptAppConnectionCredentials({
              credentials: connectionCredentials,
              orgId: actor.orgId,
              kmsService,
              projectId: appConnection.projectId
            })
          : undefined;

        return appConnectionDAL.updateById(connectionId, {
          orgId: actor.orgId,
          encryptedCredentials,
          gatewayId,
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
            method,
            gatewayId
          } as TAppConnectionConfig,
          (platformCredentials) => updateConnection(platformCredentials),
          gatewayService
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

    if (appConnection.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId: appConnection.projectId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAppConnectionActions.Delete,
        subject(ProjectPermissionSub.AppConnections, { connectionId: appConnection.id })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission(
        actor.type,
        actor.id,
        actor.orgId,
        actor.authMethod,
        appConnection.orgId
      );

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Delete,
        subject(OrgPermissionSubjects.AppConnections, { connectionId: appConnection.id })
      );
    }

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

    await enterpriseAppCheck(
      licenseService,
      app,
      actor.orgId,
      "Failed to connect app due to plan restriction. Upgrade plan to access enterprise app connections."
    );

    if (appConnection.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId: appConnection.projectId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        actionProjectType: ActionProjectType.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAppConnectionActions.Connect,
        subject(ProjectPermissionSub.AppConnections, { connectionId: appConnection.id })
      );
    } else {
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
    }

    if (appConnection.app !== app)
      throw new BadRequestError({
        message: `${
          APP_CONNECTION_NAME_MAP[appConnection.app as AppConnection]
        } Connection with ID ${connectionId} cannot be used to connect to ${APP_CONNECTION_NAME_MAP[app]}`
      });

    const connection = await decryptAppConnection(appConnection, kmsService);

    return connection as T;
  };

  const listAvailableAppConnectionsForUser = async (app: AppConnection, actor: OrgServiceActor, projectId: string) => {
    const project = await projectDAL.findProjectById(projectId);

    if (!project) throw new BadRequestError({ message: `Could not find project with ID ${projectId}` });

    const { permission: projectPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.Any
    });

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionAppConnectionActions.Connect,
      ProjectPermissionSub.AppConnections
    );

    const { permission: orgPermission } = await permissionService.getOrgPermission(
      actor.type,
      actor.id,
      actor.orgId,
      actor.authMethod,
      actor.orgId
    );

    const orgAppConnections = await appConnectionDAL.find({ app, orgId: actor.orgId, projectId: null });

    const availableOrgConnections = orgAppConnections.filter((connection) =>
      orgPermission.can(
        OrgPermissionAppConnectionActions.Connect,
        subject(OrgPermissionSubjects.AppConnections, { connectionId: connection.id })
      )
    );

    const projectAppConnections = await appConnectionDAL.find({ app, projectId });

    const availableProjectConnections = projectAppConnections.filter((connection) =>
      projectPermission.can(
        ProjectPermissionAppConnectionActions.Connect,
        subject(ProjectPermissionSub.AppConnections, { connectionId: connection.id })
      )
    );

    return [...availableOrgConnections, ...availableProjectConnections].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    ) as Omit<TAppConnection, "credentials">[];
  };

  const findAppConnectionUsageById = async (app: AppConnection, connectionId: string, actor: OrgServiceActor) => {
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

    const projectUsage = await appConnectionDAL.findAppConnectionUsageById(connectionId);

    return projectUsage;
  };

  const migrateAppConnection = async <T extends TAppConnection>(
    app: AppConnection,
    connectionId: string,
    actor: OrgServiceActor
  ) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission, membership } = await permissionService.getOrgPermission(
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

    if (membership.role !== OrgMembershipRole.Admin) {
      throw new BadRequestError({
        message: "You must be an organization admin to migrate App Connections"
      });
    }

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    const decryptedConnection = await decryptAppConnection(appConnection, kmsService);

    const {
      createdAt,
      id,
      version,
      updatedAt,
      projectId,
      encryptedCredentials: orgEncryptedCredentials,
      ...createPayload
    } = appConnection;

    if (projectId) {
      throw new BadRequestError({
        message: "This App Connection already belongs to a project and cannot be migrated"
      });
    }

    await appConnectionDAL.transaction(async (tx) => {
      const projectUsage = await appConnectionDAL.findAppConnectionUsageById(connectionId, tx);

      if (!projectUsage.length) {
        throw new BadRequestError({
          message: "This App Connection is not used in any projects."
        });
      }

      for await (const project of projectUsage) {
        const encryptedCredentials = await encryptAppConnectionCredentials({
          credentials: decryptedConnection.credentials,
          orgId: actor.orgId,
          kmsService,
          projectId: project.id
        });

        const projectAppConnection = await appConnectionDAL.create(
          {
            ...createPayload,
            encryptedCredentials,
            projectId: project.id
          },
          tx
        );

        if (project.resources.secretSyncs.length) {
          await secretSyncDAL.update(
            {
              $in: {
                id: project.resources.secretSyncs.map((r) => r.id)
              }
            },
            {
              connectionId: projectAppConnection.id
            },
            tx
          );
        }

        if (project.resources.secretRotations.length) {
          await secretRotationV2DAL.update(
            {
              $in: {
                id: project.resources.secretRotations.map((r) => r.id)
              }
            },
            {
              connectionId: projectAppConnection.id
            },
            tx
          );
        }

        if (project.resources.dataSources.length) {
          await secretScanningV2DAL.dataSources.update(
            {
              $in: {
                id: project.resources.dataSources.map((r) => r.id)
              }
            },
            {
              connectionId: projectAppConnection.id
            },
            tx
          );
        }

        if (project.resources.externalCas.length) {
          const appConnectionProperty = project.resources.externalCas.filter(
            (ex) => ex.appConnectionId === connectionId
          );
          const dnsAppConnectionProperty = project.resources.externalCas.filter(
            (ex) => ex.dnsAppConnectionId === connectionId
          );

          if (appConnectionProperty.length) {
            await externalCertificateAuthorityDAL.update(
              {
                $in: {
                  id: appConnectionProperty.map((r) => r.id)
                }
              },
              {
                appConnectionId: projectAppConnection.id
              },
              tx
            );
          }

          if (dnsAppConnectionProperty.length) {
            await externalCertificateAuthorityDAL.update(
              {
                $in: {
                  id: dnsAppConnectionProperty.map((r) => r.id)
                }
              },
              {
                dnsAppConnectionId: projectAppConnection.id
              },
              tx
            );
          }
        }
      }
    });

    return decryptedConnection as T;
  };

  return {
    listAppConnectionOptions,
    listAppConnections,
    findAppConnectionById,
    findAppConnectionByName,
    createAppConnection,
    updateAppConnection,
    deleteAppConnection,
    connectAppConnectionById,
    listAvailableAppConnectionsForUser,
    findAppConnectionUsageById,
    migrateAppConnection,
    github: githubConnectionService(connectAppConnectionById, gatewayService),
    githubRadar: githubRadarConnectionService(connectAppConnectionById),
    gcp: gcpConnectionService(connectAppConnectionById),
    databricks: databricksConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    aws: awsConnectionService(connectAppConnectionById),
    humanitec: humanitecConnectionService(connectAppConnectionById),
    terraformCloud: terraformCloudConnectionService(connectAppConnectionById),
    camunda: camundaConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    vercel: vercelConnectionService(connectAppConnectionById),
    azureClientSecrets: azureClientSecretsConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    azureDevOps: azureDevOpsConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    auth0: auth0ConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    hcvault: hcVaultConnectionService(connectAppConnectionById),
    windmill: windmillConnectionService(connectAppConnectionById),
    teamcity: teamcityConnectionService(connectAppConnectionById),
    oci: ociConnectionService(connectAppConnectionById, licenseService),
    onepass: onePassConnectionService(connectAppConnectionById),
    heroku: herokuConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    render: renderConnectionService(connectAppConnectionById),
    flyio: flyioConnectionService(connectAppConnectionById),
    gitlab: gitlabConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    cloudflare: cloudflareConnectionService(connectAppConnectionById),
    zabbix: zabbixConnectionService(connectAppConnectionById),
    railway: railwayConnectionService(connectAppConnectionById),
    bitbucket: bitbucketConnectionService(connectAppConnectionById),
    checkly: checklyConnectionService(connectAppConnectionById),
    supabase: supabaseConnectionService(connectAppConnectionById),
    digitalOcean: digitalOceanAppPlatformConnectionService(connectAppConnectionById),
    netlify: netlifyConnectionService(connectAppConnectionById),
    okta: oktaConnectionService(connectAppConnectionById)
  };
};
