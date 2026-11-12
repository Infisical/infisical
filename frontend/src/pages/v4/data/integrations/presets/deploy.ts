import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CircleCIConnectionMethod } from "@app/hooks/api/appConnections/types/circleci-connection";
import { Cloud66ConnectionMethod } from "@app/hooks/api/appConnections/types/cloud-66-connection";
import { ConvexConnectionMethod } from "@app/hooks/api/appConnections/types/convex-connection";
import { FlyioConnectionMethod } from "@app/hooks/api/appConnections/types/flyio-connection";
import { HasuraCloudConnectionMethod } from "@app/hooks/api/appConnections/types/hasura-cloud-connection";
import { HumanitecConnectionMethod } from "@app/hooks/api/appConnections/types/humanitec-connection";
import { LaravelForgeConnectionMethod } from "@app/hooks/api/appConnections/types/laravel-forge-connection";
import { NetlifyConnectionMethod } from "@app/hooks/api/appConnections/types/netlify-connection";
import { NorthflankConnectionMethod } from "@app/hooks/api/appConnections/types/northflank-connection";
import { OctopusDeployConnectionMethod } from "@app/hooks/api/appConnections/types/octopus-deploy-connection";
import { QoveryConnectionMethod } from "@app/hooks/api/appConnections/types/qovery-connection";
import { RailwayConnectionMethod } from "@app/hooks/api/appConnections/types/railway-connection";
import { RenderConnectionMethod } from "@app/hooks/api/appConnections/types/render-connection";
import { SpaceliftConnectionMethod } from "@app/hooks/api/appConnections/types/spacelift-connection";
import { SupabaseConnectionMethod } from "@app/hooks/api/appConnections/types/supabase-connection";
import { TeamCityConnectionMethod } from "@app/hooks/api/appConnections/types/teamcity-connection";
import { TerraformCloudConnectionMethod } from "@app/hooks/api/appConnections/types/terraform-cloud-connection";
import { TravisCIConnectionMethod } from "@app/hooks/api/appConnections/types/travis-ci-connection";
import { VercelConnectionMethod } from "@app/hooks/api/appConnections/types/vercel-connection";
import {
  humanitecConnectionFormSchema,
  terraformCloudConnectionFormSchema,
  vercelConnectionFormSchema,
  teamCityConnectionFormSchema,
  renderConnectionFormSchema,
  flyioConnectionFormSchema,
  railwayConnectionFormSchema,
  supabaseConnectionFormSchema,
  netlifyConnectionFormSchema,
  northflankConnectionFormSchema,
  laravelForgeConnectionFormSchema,
  octopusDeployConnectionFormSchema,
  circleCIConnectionFormSchema,
  travisCIConnectionFormSchema,
  convexConnectionFormSchema,
  hasuraCloudConnectionFormSchema,
  qoveryConnectionFormSchema,
  cloud66ConnectionFormSchema,
  spaceliftConnectionFormSchema
} from "@app/lib/schemas/app-connections";
import type { AppConnectionPreset } from "@app/pages/v4/components/app-connection-form";

import { methodLabel } from "./shared";

export const DEPLOY_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  [AppConnection.Humanitec]: {
    app: AppConnection.Humanitec,
    name: APP_CONNECTION_MAP[AppConnection.Humanitec].name,
    schema: humanitecConnectionFormSchema,
    methods: [
      {
        value: HumanitecConnectionMethod.ApiToken,
        label: methodLabel(HumanitecConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "Service API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.TerraformCloud]: {
    app: AppConnection.TerraformCloud,
    name: APP_CONNECTION_MAP[AppConnection.TerraformCloud].name,
    schema: terraformCloudConnectionFormSchema,
    methods: [
      {
        value: TerraformCloudConnectionMethod.ApiToken,
        label: methodLabel(TerraformCloudConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Vercel]: {
    app: AppConnection.Vercel,
    name: APP_CONNECTION_MAP[AppConnection.Vercel].name,
    schema: vercelConnectionFormSchema,
    methods: [
      {
        value: VercelConnectionMethod.ApiToken,
        label: methodLabel(VercelConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "Service API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.TeamCity]: {
    app: AppConnection.TeamCity,
    name: APP_CONNECTION_MAP[AppConnection.TeamCity].name,
    schema: teamCityConnectionFormSchema,
    methods: [
      {
        value: TeamCityConnectionMethod.AccessToken,
        label: methodLabel(TeamCityConnectionMethod.AccessToken),
        credentials: { instanceUrl: "", accessToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://yourcompany.teamcity.com"
          },
          { name: "credentials.accessToken", label: "Access token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Render]: {
    app: AppConnection.Render,
    name: APP_CONNECTION_MAP[AppConnection.Render].name,
    schema: renderConnectionFormSchema,
    methods: [
      {
        value: RenderConnectionMethod.ApiKey,
        label: methodLabel(RenderConnectionMethod.ApiKey),
        credentials: { apiKey: "" },
        fields: [{ name: "credentials.apiKey", label: "API key", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Flyio]: {
    app: AppConnection.Flyio,
    name: APP_CONNECTION_MAP[AppConnection.Flyio].name,
    schema: flyioConnectionFormSchema,
    methods: [
      {
        value: FlyioConnectionMethod.AccessToken,
        label: methodLabel(FlyioConnectionMethod.AccessToken),
        credentials: { accessToken: "" },
        fields: [{ name: "credentials.accessToken", label: "Access token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Railway]: {
    app: AppConnection.Railway,
    name: APP_CONNECTION_MAP[AppConnection.Railway].name,
    schema: railwayConnectionFormSchema,
    methods: [
      {
        value: RailwayConnectionMethod.AccountToken,
        label: methodLabel(RailwayConnectionMethod.AccountToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "Token value", kind: "secret" }]
      },
      {
        value: RailwayConnectionMethod.ProjectToken,
        label: methodLabel(RailwayConnectionMethod.ProjectToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "Token value", kind: "secret" }]
      },
      {
        value: RailwayConnectionMethod.TeamToken,
        label: methodLabel(RailwayConnectionMethod.TeamToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "Token value", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Supabase]: {
    app: AppConnection.Supabase,
    name: APP_CONNECTION_MAP[AppConnection.Supabase].name,
    schema: supabaseConnectionFormSchema,
    methods: [
      {
        value: SupabaseConnectionMethod.AccessToken,
        label: methodLabel(SupabaseConnectionMethod.AccessToken),
        credentials: { accessKey: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            optional: true,
            placeholder: "https://api.supabase.com",
            description: "Leave empty to use Supabase Cloud."
          },
          { name: "credentials.accessKey", label: "Access key value", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Netlify]: {
    app: AppConnection.Netlify,
    name: APP_CONNECTION_MAP[AppConnection.Netlify].name,
    schema: netlifyConnectionFormSchema,
    methods: [
      {
        value: NetlifyConnectionMethod.AccessToken,
        label: methodLabel(NetlifyConnectionMethod.AccessToken),
        credentials: { accessToken: "" },
        fields: [{ name: "credentials.accessToken", label: "Access token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Northflank]: {
    app: AppConnection.Northflank,
    name: APP_CONNECTION_MAP[AppConnection.Northflank].name,
    schema: northflankConnectionFormSchema,
    methods: [
      {
        value: NorthflankConnectionMethod.ApiToken,
        label: methodLabel(NorthflankConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.LaravelForge]: {
    app: AppConnection.LaravelForge,
    name: APP_CONNECTION_MAP[AppConnection.LaravelForge].name,
    schema: laravelForgeConnectionFormSchema,
    methods: [
      {
        value: LaravelForgeConnectionMethod.ApiToken,
        label: methodLabel(LaravelForgeConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.OctopusDeploy]: {
    app: AppConnection.OctopusDeploy,
    name: APP_CONNECTION_MAP[AppConnection.OctopusDeploy].name,
    schema: octopusDeployConnectionFormSchema,
    methods: [
      {
        value: OctopusDeployConnectionMethod.ApiKey,
        label: methodLabel(OctopusDeployConnectionMethod.ApiKey),
        credentials: { instanceUrl: "", apiKey: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://xxxx.octopus.app"
          },
          { name: "credentials.apiKey", label: "API key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.CircleCI]: {
    app: AppConnection.CircleCI,
    name: APP_CONNECTION_MAP[AppConnection.CircleCI].name,
    schema: circleCIConnectionFormSchema,
    methods: [
      {
        value: CircleCIConnectionMethod.ApiToken,
        label: methodLabel(CircleCIConnectionMethod.ApiToken),
        credentials: { host: "", apiToken: "" },
        fields: [
          {
            name: "credentials.host",
            label: "Instance hostname",
            mono: true,
            optional: true,
            placeholder: "circleci.com",
            description: "Leave empty for circleci.com."
          },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.TravisCI]: {
    app: AppConnection.TravisCI,
    name: APP_CONNECTION_MAP[AppConnection.TravisCI].name,
    schema: travisCIConnectionFormSchema,
    methods: [
      {
        value: TravisCIConnectionMethod.ApiToken,
        label: methodLabel(TravisCIConnectionMethod.ApiToken),
        credentials: { apiToken: "" },
        fields: [{ name: "credentials.apiToken", label: "API token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Convex]: {
    app: AppConnection.Convex,
    name: APP_CONNECTION_MAP[AppConnection.Convex].name,
    schema: convexConnectionFormSchema,
    methods: [
      {
        value: ConvexConnectionMethod.PersonalAccessToken,
        label: methodLabel(ConvexConnectionMethod.PersonalAccessToken),
        credentials: { accessToken: "", instanceUrl: "" },
        fields: [
          { name: "credentials.accessToken", label: "Access token", kind: "secret" },
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            optional: true,
            placeholder: "https://api.convex.dev",
            description: "Leave empty to use https://api.convex.dev."
          }
        ]
      }
    ]
  },
  [AppConnection.HasuraCloud]: {
    app: AppConnection.HasuraCloud,
    name: APP_CONNECTION_MAP[AppConnection.HasuraCloud].name,
    schema: hasuraCloudConnectionFormSchema,
    methods: [
      {
        value: HasuraCloudConnectionMethod.AccessToken,
        label: methodLabel(HasuraCloudConnectionMethod.AccessToken),
        credentials: { accessToken: "" },
        fields: [{ name: "credentials.accessToken", label: "Access token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Qovery]: {
    app: AppConnection.Qovery,
    name: APP_CONNECTION_MAP[AppConnection.Qovery].name,
    schema: qoveryConnectionFormSchema,
    methods: [
      {
        value: QoveryConnectionMethod.AccessToken,
        label: methodLabel(QoveryConnectionMethod.AccessToken),
        credentials: { accessToken: "" },
        fields: [{ name: "credentials.accessToken", label: "Project access token", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Cloud66]: {
    app: AppConnection.Cloud66,
    name: APP_CONNECTION_MAP[AppConnection.Cloud66].name,
    schema: cloud66ConnectionFormSchema,
    methods: [
      {
        value: Cloud66ConnectionMethod.AccessToken,
        label: methodLabel(Cloud66ConnectionMethod.AccessToken),
        credentials: { accessToken: "" },
        fields: [
          { name: "credentials.accessToken", label: "Personal access token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Spacelift]: {
    app: AppConnection.Spacelift,
    name: APP_CONNECTION_MAP[AppConnection.Spacelift].name,
    schema: spaceliftConnectionFormSchema,
    methods: [
      {
        value: SpaceliftConnectionMethod.ApiKeySecret,
        label: methodLabel(SpaceliftConnectionMethod.ApiKeySecret),
        credentials: { apiUrl: "", apiKeyId: "", apiKeySecret: "" },
        fields: [
          {
            name: "credentials.apiUrl",
            label: "API URL",
            mono: true,
            placeholder: "https://myaccount.app.spacelift.io"
          },
          { name: "credentials.apiKeyId", label: "API key ID", mono: true },
          { name: "credentials.apiKeySecret", label: "API key secret", kind: "secret" }
        ]
      }
    ]
  }
};
