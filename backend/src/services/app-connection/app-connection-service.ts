import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, OrganizationActionScope, TAppConnections } from "@app/db/schemas";
import { ValidateChefConnectionCredentialsSchema } from "@app/ee/services/app-connections/chef";
import { chefConnectionService } from "@app/ee/services/app-connections/chef/chef-connection-service";
import { ValidateOCIConnectionCredentialsSchema } from "@app/ee/services/app-connections/oci";
import { ociConnectionService } from "@app/ee/services/app-connections/oci/oci-connection-service";
import { ValidateOracleDBConnectionCredentialsSchema } from "@app/ee/services/app-connections/oracledb";
import { TGatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
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
import { TIdentityUaDALFactory } from "@app/services/identity-ua/identity-ua-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { ValidateOnePassConnectionCredentialsSchema } from "./1password";
import { onePassConnectionService } from "./1password/1password-connection-service";
import { ValidateAnthropicConnectionCredentialsSchema } from "./anthropic";
import { TAppConnectionDALFactory } from "./app-connection-dal";
import { AppConnection } from "./app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "./app-connection-maps";
import {
  TAppConnection,
  TAppConnectionConfig,
  TAppConnectionRaw,
  TCreateAppConnectionDTO,
  TGetAppConnectionByNameDTO,
  TUpdateAppConnectionDTO,
  TValidateAppConnectionCredentialsSchema,
  TValidateAppConnectionUsageByIdDTO
} from "./app-connection-types";
import { ValidateAuth0ConnectionCredentialsSchema } from "./auth0";
import { auth0ConnectionService } from "./auth0/auth0-connection-service";
import { ValidateAwsConnectionCredentialsSchema } from "./aws";
import { awsConnectionService } from "./aws/aws-connection-service";
import { ValidateAzureADCSConnectionCredentialsSchema } from "./azure-adcs/azure-adcs-connection-schemas";
import { azureAdcsConnectionService } from "./azure-adcs/azure-adcs-connection-service";
import { ValidateAzureAppConfigurationConnectionCredentialsSchema } from "./azure-app-configuration";
import { ValidateAzureClientSecretsConnectionCredentialsSchema } from "./azure-client-secrets";
import { azureClientSecretsConnectionService } from "./azure-client-secrets/azure-client-secrets-service";
import { ValidateAzureDevOpsConnectionCredentialsSchema } from "./azure-devops/azure-devops-schemas";
import { azureDevOpsConnectionService } from "./azure-devops/azure-devops-service";
import { ValidateAzureDnsConnectionCredentialsSchema } from "./azure-dns/azure-dns-connection-schema";
import { azureDnsConnectionService } from "./azure-dns/azure-dns-connection-service";
import { ValidateAzureEntraIdConnectionCredentialsSchema } from "./azure-entra-id";
import { azureEntraIdConnectionService } from "./azure-entra-id/azure-entra-id-connection-service";
import { ValidateAzureKeyVaultConnectionCredentialsSchema } from "./azure-key-vault";
import { ValidateBitbucketConnectionCredentialsSchema } from "./bitbucket";
import { bitbucketConnectionService } from "./bitbucket/bitbucket-connection-service";
import { ValidateCamundaConnectionCredentialsSchema } from "./camunda";
import { camundaConnectionService } from "./camunda/camunda-connection-service";
import { ValidateChecklyConnectionCredentialsSchema } from "./checkly";
import { checklyConnectionService } from "./checkly/checkly-connection-service";
import { ValidateCircleCIConnectionCredentialsSchema } from "./circleci";
import { circleciConnectionService } from "./circleci/circleci-connection-service";
import { ValidateCloudflareConnectionCredentialsSchema } from "./cloudflare/cloudflare-connection-schema";
import { cloudflareConnectionService } from "./cloudflare/cloudflare-connection-service";
import { ValidateCoolifyConnectionCredentialsSchema } from "./coolify";
import { coolifyConnectionService } from "./coolify/coolify-connection-service";
import { TAppConnectionCredentialRotationServiceFactory } from "./credential-rotation";
import { ValidateDatabricksConnectionCredentialsSchema } from "./databricks";
import { databricksConnectionService } from "./databricks/databricks-connection-service";
import { ValidateDbtConnectionCredentialsSchema } from "./dbt";
import { dbtConnectionService } from "./dbt/dbt-connection-service";
import { ValidateDigitalOceanConnectionCredentialsSchema } from "./digital-ocean";
import { digitalOceanAppPlatformConnectionService } from "./digital-ocean/digital-ocean-connection-service";
import { ValidateDNSMadeEasyConnectionCredentialsSchema } from "./dns-made-easy/dns-made-easy-connection-schema";
import { dnsMadeEasyConnectionService } from "./dns-made-easy/dns-made-easy-connection-service";
import { ValidateExternalInfisicalConnectionCredentialsSchema } from "./external-infisical";
import { externalInfisicalConnectionService } from "./external-infisical/external-infisical-connection-service";
import { ValidateFlyioConnectionCredentialsSchema } from "./flyio";
import { flyioConnectionService } from "./flyio/flyio-connection-service";
import { ValidateGcpConnectionCredentialsSchema } from "./gcp";
import { gcpConnectionService } from "./gcp/gcp-connection-service";
import { ValidateGitHubConnectionCredentialsSchema } from "./github";
import { githubConnectionService } from "./github/github-connection-service";
import { ValidateGitHubRadarConnectionCredentialsSchema } from "./github-radar";
import { githubRadarConnectionService } from "./github-radar/github-radar-connection-service";
import { ValidateGitLabConnectionCredentialsSchema } from "./gitlab";
import { gitlabConnectionService } from "./gitlab/gitlab-connection-service";
import { ValidateHCVaultConnectionCredentialsSchema } from "./hc-vault";
import { hcVaultConnectionService } from "./hc-vault/hc-vault-connection-service";
import { ValidateHerokuConnectionCredentialsSchema } from "./heroku";
import { herokuConnectionService } from "./heroku/heroku-connection-service";
import { ValidateHumanitecConnectionCredentialsSchema } from "./humanitec";
import { humanitecConnectionService } from "./humanitec/humanitec-connection-service";
import { ValidateLaravelForgeConnectionCredentialsSchema } from "./laravel-forge";
import { laravelForgeConnectionService } from "./laravel-forge/laravel-forge-connection-service";
import { ValidateLdapConnectionCredentialsSchema } from "./ldap";
import { ValidateMongoDBConnectionCredentialsSchema } from "./mongodb";
import { ValidateMsSqlConnectionCredentialsSchema } from "./mssql";
import { ValidateMySqlConnectionCredentialsSchema } from "./mysql";
import { ValidateNetlifyConnectionCredentialsSchema } from "./netlify";
import { netlifyConnectionService } from "./netlify/netlify-connection-service";
import { ValidateNetScalerConnectionCredentialsSchema } from "./netscaler";
import { ValidateNorthflankConnectionCredentialsSchema } from "./northflank";
import { northflankConnectionService } from "./northflank/northflank-connection-service";
import { ValidateOctopusDeployConnectionCredentialsSchema } from "./octopus-deploy";
import { octopusDeployConnectionService } from "./octopus-deploy/octopus-deploy-connection-service";
import { ValidateOktaConnectionCredentialsSchema } from "./okta";
import { oktaConnectionService } from "./okta/okta-connection-service";
import { ValidateOpenRouterConnectionCredentialsSchema } from "./open-router";
import { ValidatePostgresConnectionCredentialsSchema } from "./postgres";
import { ValidateRailwayConnectionCredentialsSchema } from "./railway";
import { railwayConnectionService } from "./railway/railway-connection-service";
import { ValidateRedisConnectionCredentialsSchema } from "./redis";
import { ValidateRenderConnectionCredentialsSchema } from "./render/render-connection-schema";
import { renderConnectionService } from "./render/render-connection-service";
import { ValidateSmbConnectionCredentialsSchema } from "./smb";
import { ValidateSshConnectionCredentialsSchema } from "./ssh";
import { ValidateSupabaseConnectionCredentialsSchema } from "./supabase";
import { supabaseConnectionService } from "./supabase/supabase-connection-service";
import { ValidateTeamCityConnectionCredentialsSchema } from "./teamcity";
import { teamcityConnectionService } from "./teamcity/teamcity-connection-service";
import { ValidateTerraformCloudConnectionCredentialsSchema } from "./terraform-cloud";
import { terraformCloudConnectionService } from "./terraform-cloud/terraform-cloud-connection-service";
import { ValidateVenafiConnectionCredentialsSchema } from "./venafi/venafi-connection-schema";
import { venafiConnectionService } from "./venafi/venafi-connection-service";
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
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayDAL: Pick<TGatewayDALFactory, "find">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "findProjectById">;
  appConnectionCredentialRotationService: TAppConnectionCredentialRotationServiceFactory;
  identityUaDAL: Pick<TIdentityUaDALFactory, "findOne">;
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
  [AppConnection.AzureADCS]: ValidateAzureADCSConnectionCredentialsSchema,
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
  [AppConnection.LaravelForge]: ValidateLaravelForgeConnectionCredentialsSchema,
  [AppConnection.Flyio]: ValidateFlyioConnectionCredentialsSchema,
  [AppConnection.GitLab]: ValidateGitLabConnectionCredentialsSchema,
  [AppConnection.Cloudflare]: ValidateCloudflareConnectionCredentialsSchema,
  [AppConnection.DNSMadeEasy]: ValidateDNSMadeEasyConnectionCredentialsSchema,
  [AppConnection.AzureDNS]: ValidateAzureDnsConnectionCredentialsSchema,
  [AppConnection.Zabbix]: ValidateZabbixConnectionCredentialsSchema,
  [AppConnection.Railway]: ValidateRailwayConnectionCredentialsSchema,
  [AppConnection.Bitbucket]: ValidateBitbucketConnectionCredentialsSchema,
  [AppConnection.Checkly]: ValidateChecklyConnectionCredentialsSchema,
  [AppConnection.Supabase]: ValidateSupabaseConnectionCredentialsSchema,
  [AppConnection.DigitalOcean]: ValidateDigitalOceanConnectionCredentialsSchema,
  [AppConnection.Netlify]: ValidateNetlifyConnectionCredentialsSchema,
  [AppConnection.Northflank]: ValidateNorthflankConnectionCredentialsSchema,
  [AppConnection.Okta]: ValidateOktaConnectionCredentialsSchema,
  [AppConnection.OpenRouter]: ValidateOpenRouterConnectionCredentialsSchema,
  [AppConnection.Redis]: ValidateRedisConnectionCredentialsSchema,
  [AppConnection.MongoDB]: ValidateMongoDBConnectionCredentialsSchema,
  [AppConnection.Chef]: ValidateChefConnectionCredentialsSchema,
  [AppConnection.OctopusDeploy]: ValidateOctopusDeployConnectionCredentialsSchema,
  [AppConnection.SSH]: ValidateSshConnectionCredentialsSchema,
  [AppConnection.Dbt]: ValidateDbtConnectionCredentialsSchema,
  [AppConnection.SMB]: ValidateSmbConnectionCredentialsSchema,
  [AppConnection.CircleCI]: ValidateCircleCIConnectionCredentialsSchema,
  [AppConnection.AzureEntraId]: ValidateAzureEntraIdConnectionCredentialsSchema,
  [AppConnection.Venafi]: ValidateVenafiConnectionCredentialsSchema,
  [AppConnection.ExternalInfisical]: ValidateExternalInfisicalConnectionCredentialsSchema,
  [AppConnection.NetScaler]: ValidateNetScalerConnectionCredentialsSchema,
  [AppConnection.Anthropic]: ValidateAnthropicConnectionCredentialsSchema,
  [AppConnection.Coolify]: ValidateCoolifyConnectionCredentialsSchema
};

export const appConnectionServiceFactory = ({
  appConnectionDAL,
  permissionService,
  kmsService,
  licenseService,
  gatewayService,
  gatewayV2Service,
  gatewayDAL,
  gatewayV2DAL,
  projectDAL,
  appConnectionCredentialRotationService,
  identityUaDAL
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
        await appConnectionDAL.findWithProjectDetails({
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
      const { permission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: actor.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Read,
        OrgPermissionSubjects.AppConnections
      );

      appConnections = (
        await appConnectionDAL.findWithProjectDetails({
          orgId: actor.orgId,
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
        ProjectPermissionAppConnectionActions.Read,
        subject(ProjectPermissionSub.AppConnections, { connectionId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: appConnection.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Read,
        subject(OrgPermissionSubjects.AppConnections, { connectionId })
      );
    }

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    return decryptAppConnection(appConnection, kmsService);
  };

  const findAppConnectionByName = async (
    app: AppConnection,
    { connectionName, projectId }: TGetAppConnectionByNameDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await appConnectionDAL.findOne({
      name: connectionName,
      ...(projectId ? { projectId } : { orgId: actor.orgId, projectId: null })
    });

    if (!appConnection)
      throw new NotFoundError({
        message: `Could not find App Connection with name ${connectionName} in ${projectId ? "project" : "organization"} scope.`
      });

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
        ProjectPermissionAppConnectionActions.Read,
        subject(ProjectPermissionSub.AppConnections, { connectionId: appConnection.id })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: appConnection.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Read,
        subject(OrgPermissionSubjects.AppConnections, { connectionId: appConnection.id })
      );
    }

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with name ${connectionName} is not for App "${app}"` });

    return decryptAppConnection(appConnection, kmsService);
  };

  const createAppConnection = async (
    {
      method,
      app,
      credentials,
      gatewayId,
      projectId,
      rotation,
      isAutoRotationEnabled,
      ...params
    }: TCreateAppConnectionDTO,
    actor: OrgServiceActor
  ) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    if (projectId) {
      const project = await projectDAL.findProjectById(projectId);

      if (!project) throw new BadRequestError({ message: `Could not find project with ID ${projectId}` });

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
    } else {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Create,
        OrgPermissionSubjects.AppConnections
      );
    }

    if (gatewayId) {
      const plan = await licenseService.getPlan(actor.orgId);
      if (!plan.gateway) {
        throw new BadRequestError({
          message:
            "Your current plan does not support gateway usage with app connections. Please upgrade your plan or contact Infisical Sales for assistance."
        });
      }

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: actor.orgId });
      const [gatewayV2] = await gatewayV2DAL.find({ id: gatewayId, orgId: actor.orgId });
      if (!gateway && !gatewayV2) {
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
      gatewayService,
      gatewayV2Service,
      { identityUaDAL }
    );

    try {
      const createConnection = async (connectionCredentials: TAppConnection["credentials"]) => {
        return appConnectionDAL.transaction(async (tx) => {
          const encryptedCredentials = await encryptAppConnectionCredentials({
            credentials: connectionCredentials,
            orgId: actor.orgId,
            kmsService,
            projectId
          });

          const appConnection = await appConnectionDAL.create(
            {
              orgId: actor.orgId,
              encryptedCredentials,
              method,
              app,
              gatewayId,
              projectId,
              isAutoRotationEnabled,
              ...params
            },
            tx
          );

          if (isAutoRotationEnabled && rotation) {
            await appConnectionCredentialRotationService.createRotation(
              {
                connectionId: appConnection.id,
                ...rotation
              },
              tx
            );
          }

          return appConnection;
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
          gatewayService,
          gatewayV2Service
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
    { connectionId, credentials, gatewayId, isAutoRotationEnabled, rotation, ...params }: TUpdateAppConnectionDTO,
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

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: appConnection.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

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
        subject(ProjectPermissionSub.AppConnections, { connectionId })
      );
    } else {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Edit,
        subject(OrgPermissionSubjects.AppConnections, { connectionId })
      );
    }

    if (gatewayId !== undefined && gatewayId !== appConnection.gatewayId) {
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );

      if (gatewayId) {
        const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: actor.orgId });
        const [gatewayV2] = await gatewayV2DAL.find({ id: gatewayId, orgId: actor.orgId });
        if (!gateway && !gatewayV2) {
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
        gatewayService,
        gatewayV2Service,
        { identityUaDAL }
      );

      if (!updatedCredentials)
        throw new BadRequestError({ message: "Unable to validate connection - check credentials" });
    }

    try {
      const updateConnection = async (connectionCredentials: TAppConnection["credentials"] | undefined, tx?: Knex) => {
        const encryptedCredentials = connectionCredentials
          ? await encryptAppConnectionCredentials({
            credentials: connectionCredentials,
            orgId: actor.orgId,
            kmsService,
            projectId: appConnection.projectId
          })
          : undefined;

        return appConnectionDAL.updateById(
          connectionId,
          {
            orgId: actor.orgId,
            encryptedCredentials,
            gatewayId,
            ...params
          },
          tx
        );
      };

      // Check if the connection has an existing rotation
      const existingRotation = await appConnectionCredentialRotationService.getRotationByConnectionId(connectionId);

      if (params.isPlatformManagedCredentials) {
        if (!updatedCredentials)
          // prevent enabling platform managed credentials without re-confirming credentials
          throw new BadRequestError({ message: "Credentials required to transition to platform managed credentials" });
      }

      const updatedConnection = await appConnectionDAL.transaction(async (tx) => {
        if (credentials && existingRotation) {
          // Credential change with active rotation: tear down old rotation first
          await appConnectionCredentialRotationService.updateRotation(
            { connectionId, isAutoRotationEnabled: false },
            tx
          );
        }

        let connection: TAppConnectionRaw;
        if (params.isPlatformManagedCredentials) {
          connection = await TRANSITION_CONNECTION_CREDENTIALS_TO_PLATFORM[app](
            {
              app,
              orgId: actor.orgId,
              credentials: updatedCredentials,
              method,
              gatewayId
            } as TAppConnectionConfig,
            (platformCredentials) => updateConnection(platformCredentials, tx),
            gatewayService,
            gatewayV2Service
          );
        } else {
          connection = await updateConnection(updatedCredentials, tx);
        }

        // Handle rotation updates
        if (isAutoRotationEnabled !== undefined || rotation) {
          if (isAutoRotationEnabled === false) {
            // Disabling rotation — preserve config but stop scheduling
            if (!credentials && existingRotation) {
              await appConnectionCredentialRotationService.updateRotation(
                { connectionId, isAutoRotationEnabled: false },
                tx
              );
            }
          } else if (credentials && existingRotation) {
            // Credentials were changed and rotation was torn down above — re-enable with updated config
            await appConnectionCredentialRotationService.updateRotation(
              {
                connectionId,
                isAutoRotationEnabled: true,
                rotationInterval: rotation?.rotationInterval ?? existingRotation.rotationInterval,
                rotateAtUtc:
                  rotation?.rotateAtUtc ?? (existingRotation.rotateAtUtc as { hours: number; minutes: number })
              },
              tx
            );
          } else if (existingRotation && isAutoRotationEnabled === true) {
            // Re-enabling rotation on a connection that was previously disabled
            await appConnectionCredentialRotationService.updateRotation(
              { connectionId, isAutoRotationEnabled: true, ...rotation },
              tx
            );
          } else if (!existingRotation && isAutoRotationEnabled && rotation) {
            // Enabling rotation on a connection that never had it
            if (!rotation.rotationInterval || !rotation.rotateAtUtc) {
              throw new BadRequestError({
                message: "Rotation interval and schedule are required when enabling rotation"
              });
            }
            await appConnectionCredentialRotationService.createRotation(
              { connectionId, rotationInterval: rotation.rotationInterval, rotateAtUtc: rotation.rotateAtUtc },
              tx
            );
            await appConnectionDAL.updateById(connectionId, { isAutoRotationEnabled: true }, tx);
          } else if (existingRotation && rotation) {
            // Updating schedule/interval on existing rotation
            await appConnectionCredentialRotationService.updateRotation({ connectionId, ...rotation }, tx);
          }
        } else if (credentials && existingRotation) {
          // Credentials changed but no rotation fields provided — re-enable with previous config
          await appConnectionCredentialRotationService.updateRotation(
            {
              connectionId,
              isAutoRotationEnabled: true,
              rotationInterval: existingRotation.rotationInterval,
              rotateAtUtc: existingRotation.rotateAtUtc as { hours: number; minutes: number }
            },
            tx
          );
        }

        return connection;
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
        subject(ProjectPermissionSub.AppConnections, { connectionId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: appConnection.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Delete,
        subject(OrgPermissionSubjects.AppConnections, { connectionId })
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
        subject(ProjectPermissionSub.AppConnections, { connectionId })
      );
    } else {
      const { permission: orgPermission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: appConnection.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionAppConnectionActions.Connect,
        subject(OrgPermissionSubjects.AppConnections, { connectionId })
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

  const validateAppConnectionUsageById = async (
    app: AppConnection,
    { connectionId, projectId }: TValidateAppConnectionUsageByIdDTO,
    actor: OrgServiceActor
  ) => {
    const appConnection = await connectAppConnectionById(app, connectionId, actor);

    if (appConnection.projectId && appConnection.projectId !== projectId) {
      throw new BadRequestError({
        message: `You cannot connect project App Connection with ID "${appConnection.id}" from project with ID "${appConnection.projectId}" to project with ID "${projectId}"`
      });
    }

    return appConnection;
  };

  const listAvailableAppConnectionsForUser = async (app: AppConnection, actor: OrgServiceActor, projectId?: string) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: actor.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    let availableProjectConnections: TAppConnections[] = [];

    if (projectId) {
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

      const projectAppConnections = await appConnectionDAL.find({ app, projectId });

      availableProjectConnections = projectAppConnections.filter((connection) =>
        projectPermission.can(
          ProjectPermissionAppConnectionActions.Connect,
          subject(ProjectPermissionSub.AppConnections, { connectionId: connection.id })
        )
      );
    }

    const orgAppConnections = await appConnectionDAL.find({ app, orgId: actor.orgId, projectId: null });

    const availableOrgConnections = orgAppConnections.filter((connection) =>
      orgPermission.can(
        OrgPermissionAppConnectionActions.Connect,
        subject(OrgPermissionSubjects.AppConnections, { connectionId: connection.id })
      )
    );

    return [...availableOrgConnections, ...availableProjectConnections].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    ) as Omit<TAppConnection, "credentials">[];
  };

  const findAppConnectionUsageById = async (app: AppConnection, connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    const { permission } = await permissionService.getOrgPermission({
      actorId: actor.id,
      actor: actor.type,
      orgId: appConnection.orgId,
      actorOrgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionAppConnectionActions.Read,
      OrgPermissionSubjects.AppConnections
    );

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

    const projectUsage = await appConnectionDAL.findAppConnectionUsageById(connectionId);

    return projectUsage;
  };

  const triggerCredentialRotation = async (
    { app, connectionId }: { app: AppConnection; connectionId: string },
    actor: OrgServiceActor
  ) => {
    const appConnection = await appConnectionDAL.findById(connectionId);

    if (!appConnection) throw new NotFoundError({ message: `Could not find App Connection with ID ${connectionId}` });

    if (appConnection.app !== app)
      throw new BadRequestError({ message: `App Connection with ID ${connectionId} is not for App "${app}"` });

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
        ProjectPermissionAppConnectionActions.RotateCredentials,
        subject(ProjectPermissionSub.AppConnections, { connectionId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actorId: actor.id,
        actor: actor.type,
        orgId: appConnection.orgId,
        actorOrgId: actor.orgId,
        actorAuthMethod: actor.authMethod,
        scope: OrganizationActionScope.Any
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAppConnectionActions.RotateCredentials,
        subject(OrgPermissionSubjects.AppConnections, { connectionId })
      );
    }

    return appConnectionCredentialRotationService.triggerRotation({ connectionId });
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
    validateAppConnectionUsageById,
    listAvailableAppConnectionsForUser,
    findAppConnectionUsageById,
    triggerCredentialRotation,
    github: githubConnectionService(connectAppConnectionById, gatewayService, gatewayV2Service),
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
    hcvault: hcVaultConnectionService(connectAppConnectionById, gatewayService, gatewayV2Service),
    windmill: windmillConnectionService(connectAppConnectionById),
    teamcity: teamcityConnectionService(connectAppConnectionById),
    oci: ociConnectionService(connectAppConnectionById, licenseService),
    onepass: onePassConnectionService(connectAppConnectionById),
    heroku: herokuConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    render: renderConnectionService(connectAppConnectionById),
    flyio: flyioConnectionService(connectAppConnectionById),
    gitlab: gitlabConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    cloudflare: cloudflareConnectionService(connectAppConnectionById),
    venafi: venafiConnectionService(connectAppConnectionById),
    azureAdcs: azureAdcsConnectionService(connectAppConnectionById),
    dnsMadeEasy: dnsMadeEasyConnectionService(connectAppConnectionById),
    azureDns: azureDnsConnectionService(connectAppConnectionById),
    zabbix: zabbixConnectionService(connectAppConnectionById),
    railway: railwayConnectionService(connectAppConnectionById),
    bitbucket: bitbucketConnectionService(connectAppConnectionById),
    checkly: checklyConnectionService(connectAppConnectionById),
    supabase: supabaseConnectionService(connectAppConnectionById),
    digitalOcean: digitalOceanAppPlatformConnectionService(connectAppConnectionById),
    netlify: netlifyConnectionService(connectAppConnectionById),
    northflank: northflankConnectionService(connectAppConnectionById),
    externalInfisical: externalInfisicalConnectionService(connectAppConnectionById),
    okta: oktaConnectionService(connectAppConnectionById),
    laravelForge: laravelForgeConnectionService(connectAppConnectionById),
    chef: chefConnectionService(connectAppConnectionById, licenseService),
    octopusDeploy: octopusDeployConnectionService(connectAppConnectionById),
    dbt: dbtConnectionService(connectAppConnectionById),
    circleci: circleciConnectionService(connectAppConnectionById),
    azureEntraId: azureEntraIdConnectionService(connectAppConnectionById, appConnectionDAL, kmsService),
    coolify: coolifyConnectionService(connectAppConnectionById)
  };
};
