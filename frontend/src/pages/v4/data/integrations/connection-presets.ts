import type { AppConnectionPreset } from "@app/components/v4/patterns/app-connection-form";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GitLabAccessTokenType } from "@app/hooks/api/appConnections/gitlab/types";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import { GitHubRadarConnectionMethod } from "@app/hooks/api/appConnections/types/github-radar-connection";
import { GitLabConnectionMethod } from "@app/hooks/api/appConnections/types/gitlab-connection";
import { PostgresConnectionMethod } from "@app/hooks/api/appConnections/types/postgres-connection";
import {
  awsConnectionFormSchema,
  gitHubPatConnectionFormSchema,
  gitHubRadarConnectionFormSchema,
  postgresConnectionFormSchema
} from "@app/lib/schemas/app-connections";

import {
  bitbucketApiTokenConnectionFormSchema,
  gitLabAccessTokenConnectionFormSchema
} from "./connection-schemas";

const methodLabel = (method: Parameters<typeof getAppConnectionMethodDetails>[0]) =>
  getAppConnectionMethodDetails(method).name;

export const CONNECTION_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  [AppConnection.GitHubRadar]: {
    app: AppConnection.GitHubRadar,
    name: APP_CONNECTION_MAP[AppConnection.GitHubRadar].name,
    schema: gitHubRadarConnectionFormSchema,
    methods: [
      {
        value: GitHubRadarConnectionMethod.App,
        label: methodLabel(GitHubRadarConnectionMethod.App),
        credentials: {},
        fields: [],
        redirect: {
          submitLabel: "Connect to GitHub",
          href: ({ option }) =>
            typeof option?.appClientSlug === "string" && option.appClientSlug
              ? `https://github.com/apps/${encodeURIComponent(option.appClientSlug)}/installations/new`
              : undefined,
          unconfigured: "This server has no GitHub App configured for GitHub Radar.",
          credentials: ({ callback }) => ({
            code: callback.code ?? "",
            installationId: callback.installation_id ?? ""
          })
        }
      }
    ]
  },
  [AppConnection.AWS]: {
    app: AppConnection.AWS,
    name: APP_CONNECTION_MAP[AppConnection.AWS].name,
    schema: awsConnectionFormSchema,
    methods: [
      {
        value: AwsConnectionMethod.AssumeRole,
        label: methodLabel(AwsConnectionMethod.AssumeRole),
        description: "No long-lived keys are stored.",
        credentials: { roleArn: "", stsEndpoint: "" },
        fields: [
          {
            name: "credentials.roleArn",
            label: "Role ARN",
            mono: true,
            placeholder: "arn:aws:iam::123456789012:role/infisical"
          },
          {
            name: "credentials.stsEndpoint",
            label: "STS endpoint",
            mono: true,
            optional: true,
            placeholder: "https://sts.us-east-1.amazonaws.com",
            description: "Leave empty to use the global endpoint."
          }
        ]
      },
      {
        value: AwsConnectionMethod.AccessKey,
        label: methodLabel(AwsConnectionMethod.AccessKey),
        description: "Uses a long-lived IAM user access key.",
        credentials: { accessKeyId: "", secretAccessKey: "" },
        fields: [
          { name: "credentials.accessKeyId", label: "Access key ID", mono: true },
          { name: "credentials.secretAccessKey", label: "Secret access key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.GitHub]: {
    app: AppConnection.GitHub,
    name: APP_CONNECTION_MAP[AppConnection.GitHub].name,
    schema: gitHubPatConnectionFormSchema,
    methods: [
      {
        value: GitHubConnectionMethod.Pat,
        label: methodLabel(GitHubConnectionMethod.Pat),
        credentials: { instanceType: "cloud", host: "", personalAccessToken: "" },
        fields: [
          {
            name: "credentials.instanceType",
            label: "Instance",
            kind: "select",
            options: [
              { value: "cloud", label: "GitHub Cloud" },
              { value: "server", label: "GitHub Enterprise Server" }
            ]
          },
          {
            name: "credentials.host",
            label: "Host",
            mono: true,
            placeholder: "github.example.com",
            visible: (values) => values.credentials?.instanceType === "server"
          },
          {
            name: "credentials.personalAccessToken",
            label: "Personal access token",
            kind: "secret"
          }
        ]
      }
    ]
  },
  [AppConnection.Bitbucket]: {
    app: AppConnection.Bitbucket,
    name: APP_CONNECTION_MAP[AppConnection.Bitbucket].name,
    schema: bitbucketApiTokenConnectionFormSchema,
    methods: [
      {
        value: BitbucketConnectionMethod.ApiToken,
        label: methodLabel(BitbucketConnectionMethod.ApiToken),
        credentials: { email: "", apiToken: "" },
        fields: [
          { name: "credentials.email", label: "Email", placeholder: "user@example.com" },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.GitLab]: {
    app: AppConnection.GitLab,
    name: APP_CONNECTION_MAP[AppConnection.GitLab].name,
    schema: gitLabAccessTokenConnectionFormSchema,
    methods: [
      {
        value: GitLabConnectionMethod.AccessToken,
        label: methodLabel(GitLabConnectionMethod.AccessToken),
        credentials: {
          instanceUrl: "",
          accessTokenType: GitLabAccessTokenType.Personal,
          accessToken: ""
        },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            optional: true,
            placeholder: "https://gitlab.com",
            description: "Leave empty for gitlab.com."
          },
          {
            name: "credentials.accessTokenType",
            label: "Token type",
            kind: "select",
            options: [
              { value: GitLabAccessTokenType.Personal, label: "Personal" },
              { value: GitLabAccessTokenType.Group, label: "Group" },
              { value: GitLabAccessTokenType.Project, label: "Project" }
            ]
          },
          { name: "credentials.accessToken", label: "Access token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Postgres]: {
    app: AppConnection.Postgres,
    name: APP_CONNECTION_MAP[AppConnection.Postgres].name,
    schema: postgresConnectionFormSchema,
    values: { gatewayId: null, gatewayPoolId: null },
    methods: [
      {
        value: PostgresConnectionMethod.UsernameAndPassword,
        label: methodLabel(PostgresConnectionMethod.UsernameAndPassword),
        credentials: {
          host: "",
          port: 5432,
          database: "default",
          username: "",
          password: "",
          sslEnabled: true,
          sslRejectUnauthorized: true,
          sslCertificate: ""
        },
        fields: [
          { name: "credentials.host", label: "Host", mono: true, placeholder: "db.example.com" },
          { name: "credentials.port", label: "Port", kind: "number" },
          { name: "credentials.database", label: "Database", mono: true },
          { name: "credentials.username", label: "Username", mono: true },
          { name: "credentials.password", label: "Password", kind: "secret" },
          { name: "credentials.sslEnabled", label: "Use SSL", kind: "switch" },
          {
            name: "credentials.sslRejectUnauthorized",
            label: "Reject unauthorized certificates",
            kind: "switch",
            visible: (values) => Boolean(values.credentials?.sslEnabled)
          },
          {
            name: "credentials.sslCertificate",
            label: "CA certificate",
            kind: "textarea",
            optional: true,
            visible: (values) => Boolean(values.credentials?.sslEnabled)
          }
        ]
      }
    ]
  }
};
