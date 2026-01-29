import { createNotification } from "@app/components/notifications";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  TAppConnection,
  useCreateAppConnection,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { DiscriminativePick } from "@app/types";

import { AppConnectionHeader } from "../AppConnectionHeader";
import { OnePassConnectionForm } from "./1PasswordConnectionForm";
import { Auth0ConnectionForm } from "./Auth0ConnectionForm";
import { AwsConnectionForm } from "./AwsConnectionForm";
import { AzureADCSConnectionForm } from "./AzureADCSConnectionForm";
import { AzureAppConfigurationConnectionForm } from "./AzureAppConfigurationConnectionForm";
import { AzureClientSecretsConnectionForm } from "./AzureClientSecretsConnectionForm";
import { AzureDevOpsConnectionForm } from "./AzureDevOpsConnectionForm";
import { AzureKeyVaultConnectionForm } from "./AzureKeyVaultConnectionForm";
import { BitbucketConnectionForm } from "./BitbucketConnectionForm";
import { CamundaConnectionForm } from "./CamundaConnectionForm";
import { ChecklyConnectionForm } from "./ChecklyConnectionForm";
import { ChefConnectionForm } from "./ChefConnectionForm";
import { CircleCIConnectionForm } from "./CircleCIConnectionForm";
import { CloudflareConnectionForm } from "./CloudflareConnectionForm";
import { DatabricksConnectionForm } from "./DatabricksConnectionForm";
import { DigitalOceanConnectionForm } from "./DigitalOceanConnectionForm";
import { DNSMadeEasyConnectionForm } from "./DNSMadeEasyConnectionForm";
import { FlyioConnectionForm } from "./FlyioConnectionForm";
import { GcpConnectionForm } from "./GcpConnectionForm";
import { GitHubConnectionForm } from "./GitHubConnectionForm";
import { GitHubRadarConnectionForm } from "./GitHubRadarConnectionForm";
import { GitLabConnectionForm } from "./GitLabConnectionForm";
import { HCVaultConnectionForm } from "./HCVaultConnectionForm";
import { HerokuConnectionForm } from "./HerokuAppConnectionForm";
import { HumanitecConnectionForm } from "./HumanitecConnectionForm";
import { LaravelForgeConnectionForm } from "./LaravelForgeConnectionForm";
import { LdapConnectionForm } from "./LdapConnectionForm";
import { MongoDBConnectionForm } from "./MongoDBConnectionForm";
import { MsSqlConnectionForm } from "./MsSqlConnectionForm";
import { MySqlConnectionForm } from "./MySqlConnectionForm";
import { NetlifyConnectionForm } from "./NetlifyConnectionForm";
import { NorthflankConnectionForm } from "./NorthflankConnectionForm";
import { OCIConnectionForm } from "./OCIConnectionForm";
import { OctopusDeployConnectionForm } from "./OctopusDeployConnectionForm";
import { OktaConnectionForm } from "./OktaConnectionForm";
import { OpenRouterConnectionForm } from "./OpenRouterConnectionForm";
import { OracleDBConnectionForm } from "./OracleDBConnectionForm";
import { PostgresConnectionForm } from "./PostgresConnectionForm";
import { RailwayConnectionForm } from "./RailwayConnectionForm";
import { RedisConnectionForm } from "./RedisConnectionForm";
import { RenderConnectionForm } from "./RenderConnectionForm";
import { SshConnectionForm } from "./SshConnectionForm";
import { SupabaseConnectionForm } from "./SupabaseConnectionForm";
import { TeamCityConnectionForm } from "./TeamCityConnectionForm";
import { TerraformCloudConnectionForm } from "./TerraformCloudConnectionForm";
import { VercelConnectionForm } from "./VercelConnectionForm";
import { WindmillConnectionForm } from "./WindmillConnectionForm";
import { ZabbixConnectionForm } from "./ZabbixConnectionForm";

type FormProps = {
  onComplete: (appConnection: TAppConnection) => void;
} & ({ appConnection: TAppConnection } | { app: AppConnection });

type CreateFormProps = FormProps & {
  app: AppConnection;
  projectId?: string;
};
type UpdateFormProps = FormProps & {
  appConnection: TAppConnection;
};

const CreateForm = ({ app, onComplete, projectId }: CreateFormProps) => {
  const createAppConnection = useCreateAppConnection();
  const { name: appName } = APP_CONNECTION_MAP[app];

  const onSubmit = async (
    formData: DiscriminativePick<
      TAppConnection,
      "method" | "name" | "app" | "credentials" | "isPlatformManagedCredentials"
    >
  ) => {
    const connection = await createAppConnection.mutateAsync({
      ...formData,
      projectId
    });
    createNotification({
      text: `Successfully added ${appName} Connection`,
      type: "success"
    });
    onComplete(connection);
  };

  switch (app) {
    case AppConnection.AWS:
      return <AwsConnectionForm onSubmit={onSubmit} />;
    case AppConnection.GitHub:
      return <GitHubConnectionForm projectId={projectId} onSubmit={onSubmit} />;
    case AppConnection.GitHubRadar:
      return <GitHubRadarConnectionForm projectId={projectId} />;
    case AppConnection.GCP:
      return <GcpConnectionForm onSubmit={onSubmit} />;
    case AppConnection.AzureKeyVault:
      return <AzureKeyVaultConnectionForm onSubmit={onSubmit} projectId={projectId} />;
    case AppConnection.AzureAppConfiguration:
      return <AzureAppConfigurationConnectionForm onSubmit={onSubmit} projectId={projectId} />;
    case AppConnection.AzureADCS:
      return <AzureADCSConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Databricks:
      return <DatabricksConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Humanitec:
      return <HumanitecConnectionForm onSubmit={onSubmit} />;
    case AppConnection.TerraformCloud:
      return <TerraformCloudConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Vercel:
      return <VercelConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Postgres:
      return <PostgresConnectionForm onSubmit={onSubmit} />;
    case AppConnection.MsSql:
      return <MsSqlConnectionForm onSubmit={onSubmit} />;
    case AppConnection.MySql:
      return <MySqlConnectionForm onSubmit={onSubmit} />;
    case AppConnection.OracleDB:
      return <OracleDBConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Camunda:
      return <CamundaConnectionForm onSubmit={onSubmit} />;
    case AppConnection.AzureClientSecrets:
      return <AzureClientSecretsConnectionForm onSubmit={onSubmit} projectId={projectId} />;
    case AppConnection.AzureDevOps:
      return <AzureDevOpsConnectionForm onSubmit={onSubmit} projectId={projectId} />;
    case AppConnection.Windmill:
      return <WindmillConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Auth0:
      return <Auth0ConnectionForm onSubmit={onSubmit} />;
    case AppConnection.HCVault:
      return <HCVaultConnectionForm onSubmit={onSubmit} />;
    case AppConnection.LDAP:
      return <LdapConnectionForm onSubmit={onSubmit} />;
    case AppConnection.TeamCity:
      return <TeamCityConnectionForm onSubmit={onSubmit} />;
    case AppConnection.OCI:
      return <OCIConnectionForm onSubmit={onSubmit} />;
    case AppConnection.OnePass:
      return <OnePassConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Heroku:
      return <HerokuConnectionForm onSubmit={onSubmit} projectId={projectId} />;
    case AppConnection.Render:
      return <RenderConnectionForm onSubmit={onSubmit} />;
    case AppConnection.LaravelForge:
      return <LaravelForgeConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Flyio:
      return <FlyioConnectionForm onSubmit={onSubmit} />;
    case AppConnection.GitLab:
      return <GitLabConnectionForm onSubmit={onSubmit} projectId={projectId} />;
    case AppConnection.Cloudflare:
      return <CloudflareConnectionForm onSubmit={onSubmit} />;
    case AppConnection.DNSMadeEasy:
      return <DNSMadeEasyConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Bitbucket:
      return <BitbucketConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Zabbix:
      return <ZabbixConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Railway:
      return <RailwayConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Checkly:
      return <ChecklyConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Chef:
      return <ChefConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Supabase:
      return <SupabaseConnectionForm onSubmit={onSubmit} />;
    case AppConnection.DigitalOcean:
      return <DigitalOceanConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Netlify:
      return <NetlifyConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Northflank:
      return <NorthflankConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Okta:
      return <OktaConnectionForm onSubmit={onSubmit} />;
    case AppConnection.Redis:
      return <RedisConnectionForm onSubmit={onSubmit} />;
    case AppConnection.MongoDB:
      return <MongoDBConnectionForm onSubmit={onSubmit} />;
    case AppConnection.OctopusDeploy:
      return <OctopusDeployConnectionForm onSubmit={onSubmit} />;
    case AppConnection.SSH:
      return <SshConnectionForm onSubmit={onSubmit} />;
    case AppConnection.OpenRouter:
      return <OpenRouterConnectionForm onSubmit={onSubmit} />;
    case AppConnection.CircleCI:
      return <CircleCIConnectionForm onSubmit={onSubmit} />;
    default:
      throw new Error(`Unhandled App ${app}`);
  }
};

const UpdateForm = ({ appConnection, onComplete }: UpdateFormProps) => {
  const updateAppConnection = useUpdateAppConnection();
  const { name: appName } = APP_CONNECTION_MAP[appConnection.app];

  const onSubmit = async (
    formData: DiscriminativePick<
      TAppConnection,
      "method" | "name" | "app" | "credentials" | "isPlatformManagedCredentials"
    >
  ) => {
    const connection = await updateAppConnection.mutateAsync({
      connectionId: appConnection.id,
      ...formData
    });
    createNotification({
      text: `Successfully updated ${appName} Connection`,
      type: "success"
    });
    onComplete(connection);
  };

  switch (appConnection.app) {
    case AppConnection.AWS:
      return <AwsConnectionForm appConnection={appConnection} onSubmit={onSubmit} />;
    case AppConnection.GitHub:
      return (
        <GitHubConnectionForm
          appConnection={appConnection}
          projectId={appConnection.projectId}
          onSubmit={onSubmit}
        />
      );
    case AppConnection.GitHubRadar:
      return (
        <GitHubRadarConnectionForm
          appConnection={appConnection}
          projectId={appConnection.projectId}
        />
      );
    case AppConnection.GCP:
      return <GcpConnectionForm appConnection={appConnection} onSubmit={onSubmit} />;
    case AppConnection.AzureKeyVault:
      return (
        <AzureKeyVaultConnectionForm
          appConnection={appConnection}
          onSubmit={onSubmit}
          projectId={appConnection.projectId}
        />
      );
    case AppConnection.AzureAppConfiguration:
      return (
        <AzureAppConfigurationConnectionForm
          appConnection={appConnection}
          onSubmit={onSubmit}
          projectId={appConnection.projectId}
        />
      );
    case AppConnection.AzureADCS:
      return <AzureADCSConnectionForm appConnection={appConnection} onSubmit={onSubmit} />;
    case AppConnection.Databricks:
      return <DatabricksConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Humanitec:
      return <HumanitecConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.TerraformCloud:
      return <TerraformCloudConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Vercel:
      return <VercelConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Postgres:
      return <PostgresConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.MsSql:
      return <MsSqlConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.MySql:
      return <MySqlConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.OracleDB:
      return <OracleDBConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Camunda:
      return <CamundaConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.AzureClientSecrets:
      return (
        <AzureClientSecretsConnectionForm
          appConnection={appConnection}
          onSubmit={onSubmit}
          projectId={appConnection.projectId}
        />
      );
    case AppConnection.AzureDevOps:
      return (
        <AzureDevOpsConnectionForm
          appConnection={appConnection}
          onSubmit={onSubmit}
          projectId={appConnection.projectId}
        />
      );
    case AppConnection.Windmill:
      return <WindmillConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Auth0:
      return <Auth0ConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.HCVault:
      return <HCVaultConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.LDAP:
      return <LdapConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.TeamCity:
      return <TeamCityConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.OCI:
      return <OCIConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.OnePass:
      return <OnePassConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Heroku:
      return (
        <HerokuConnectionForm
          onSubmit={onSubmit}
          appConnection={appConnection}
          projectId={appConnection.projectId}
        />
      );
    case AppConnection.Render:
      return <RenderConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.LaravelForge:
      return <LaravelForgeConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Flyio:
      return <FlyioConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.GitLab:
      return (
        <GitLabConnectionForm
          onSubmit={onSubmit}
          appConnection={appConnection}
          projectId={appConnection.projectId}
        />
      );
    case AppConnection.Cloudflare:
      return <CloudflareConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.DNSMadeEasy:
      return <DNSMadeEasyConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Bitbucket:
      return <BitbucketConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Zabbix:
      return <ZabbixConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Railway:
      return <RailwayConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Checkly:
      return <ChecklyConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Chef:
      return <ChefConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Supabase:
      return <SupabaseConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.DigitalOcean:
      return <DigitalOceanConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Northflank:
      return <NorthflankConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Okta:
      return <OktaConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.Redis:
      return <RedisConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.MongoDB:
      return <MongoDBConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.OctopusDeploy:
      return <OctopusDeployConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.SSH:
      return <SshConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.OpenRouter:
      return <OpenRouterConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    case AppConnection.CircleCI:
      return <CircleCIConnectionForm onSubmit={onSubmit} appConnection={appConnection} />;
    default:
      throw new Error(`Unhandled App ${(appConnection as TAppConnection).app}`);
  }
};

type Props = { onBack?: () => void; projectId?: string } & Pick<FormProps, "onComplete"> &
  (
    | { app: AppConnection; appConnection?: undefined }
    | { app?: undefined; appConnection: TAppConnection }
  );
export const AppConnectionForm = ({ onBack, projectId, ...props }: Props) => {
  const { app, appConnection } = props;

  return (
    <div>
      <AppConnectionHeader
        isConnected={Boolean(appConnection)}
        app={appConnection?.app ?? app!}
        onBack={onBack}
      />
      {appConnection ? (
        <UpdateForm {...props} appConnection={appConnection} />
      ) : (
        <CreateForm {...props} app={app} projectId={projectId} />
      )}
    </div>
  );
};
