import type { FieldValues } from "react-hook-form";
import { z } from "zod";

import type {
  AppConnectionFieldPreset,
  AppConnectionPreset
} from "@app/components/v4/patterns/app-connection-form";
import {
  APP_CONNECTION_MAP,
  buildGitHubAppUrl,
  buildGitHubHostUrl
} from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GitLabAccessTokenType } from "@app/hooks/api/appConnections/gitlab/types";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import { GitHubRadarConnectionMethod } from "@app/hooks/api/appConnections/types/github-radar-connection";
import { GitLabConnectionMethod } from "@app/hooks/api/appConnections/types/gitlab-connection";
import { PostgresConnectionMethod } from "@app/hooks/api/appConnections/types/postgres-connection";
import type { TGitHubApp } from "@app/hooks/api/gitHubApps/types";
import {
  awsConnectionFormSchema,
  bitbucketApiTokenConnectionFormSchema,
  gitHubConnectionFormSchema,
  gitHubRadarConnectionFormSchema,
  gitLabConnectionFormSchema,
  postgresConnectionFormSchema
} from "@app/lib/schemas/app-connections";

import { methodLabel } from "./shared";

const gitHubInstanceFields: AppConnectionFieldPreset[] = [
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
  }
];

const gitHubHost = (values: FieldValues) =>
  values.credentials?.instanceType === "server"
    ? (values.credentials?.host as string | undefined)
    : undefined;

const gitHubInstance = (stored: Record<string, unknown>) => {
  const server = stored.instanceType === "server" && typeof stored.host === "string";
  return server ? { instanceType: "server", host: stored.host } : { instanceType: "cloud" };
};

/** Select value for the instance's shared GitHub App, which has no id. */
export const INSTANCE_GITHUB_APP = "instance";

export const gitHubPreset = (apps: readonly TGitHubApp[] = []): AppConnectionPreset => {
  const shared = apps.find((app) => app.id === null);
  const picked = (values: FieldValues) => {
    const id = values.credentials?.gitHubAppId;
    return id === INSTANCE_GITHUB_APP ? shared : apps.find((app) => app.id && app.id === id);
  };
  const appField: AppConnectionFieldPreset = {
    name: "credentials.gitHubAppId",
    label: "GitHub App",
    kind: "select",
    options: apps.map((app) => ({
      value: app.id ?? INSTANCE_GITHUB_APP,
      label: app.name,
      group: app.id ? "Private" : "Instance",
      description: `${app.id ? (app.owner ?? "Private") : "Server admin"}, used by ${app.connectionCount} connection${app.connectionCount === 1 ? "" : "s"}`
    }))
  };
  return {
    app: AppConnection.GitHub,
    name: APP_CONNECTION_MAP[AppConnection.GitHub].name,
    schema: apps.length
      ? gitHubConnectionFormSchema.and(
          z.object({ credentials: z.object({ gitHubAppId: z.string().optional() }) })
        )
      : gitHubConnectionFormSchema,
    values: { gatewayId: null, gatewayPoolId: null },
    methods: [
      {
        value: GitHubConnectionMethod.App,
        label: methodLabel(GitHubConnectionMethod.App),
        credentials: {
          instanceType: "cloud",
          host: "",
          ...(apps.length > 0 && { gitHubAppId: shared ? INSTANCE_GITHUB_APP : apps[0].id })
        },
        fields: apps.length ? [appField, ...gitHubInstanceFields] : gitHubInstanceFields,
        redirect: {
          submitLabel: "Connect to GitHub",
          href: ({ values, option }) => {
            const slug =
              picked(values)?.slug ??
              (typeof option?.appClientSlug === "string" ? option.appClientSlug : undefined);
            return slug
              ? `${buildGitHubAppUrl(slug, gitHubHost(values), values.credentials?.instanceType)}/installations/new`
              : undefined;
          },
          unconfigured: "This server has no GitHub App configured.",
          credentials: ({ callback, stored }) => ({
            code: callback.code ?? "",
            installationId: callback.installation_id ?? "",
            ...gitHubInstance(stored),
            ...(typeof stored.gitHubAppId === "string" &&
              stored.gitHubAppId !== INSTANCE_GITHUB_APP && { gitHubAppId: stored.gitHubAppId })
          })
        }
      },
      {
        value: GitHubConnectionMethod.OAuth,
        label: methodLabel(GitHubConnectionMethod.OAuth),
        credentials: { instanceType: "cloud", host: "" },
        fields: gitHubInstanceFields,
        redirect: {
          submitLabel: "Connect to GitHub",
          href: ({ values, option }) => {
            if (typeof option?.oauthClientId !== "string" || !option.oauthClientId)
              return undefined;
            const query = new URLSearchParams({
              client_id: option.oauthClientId,
              response_type: "code",
              scope: "repo,admin:org",
              redirect_uri: `${window.location.origin}/organization/app-connections/github/oauth/callback`
            });
            return `${buildGitHubHostUrl(gitHubHost(values))}/login/oauth/authorize?${query}`;
          },
          unconfigured: "This server has no GitHub OAuth application configured.",
          credentials: ({ callback, stored }) => ({
            code: callback.code ?? "",
            ...gitHubInstance(stored)
          })
        }
      },
      {
        value: GitHubConnectionMethod.Pat,
        label: methodLabel(GitHubConnectionMethod.Pat),
        credentials: { instanceType: "cloud", host: "", personalAccessToken: "" },
        fields: [
          ...gitHubInstanceFields,
          {
            name: "credentials.personalAccessToken",
            label: "Personal access token",
            kind: "secret"
          }
        ]
      }
    ]
  };
};

export const CORE_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  [AppConnection.GitHub]: gitHubPreset(),
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
    schema: gitLabConnectionFormSchema,
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
      },
      {
        value: GitLabConnectionMethod.OAuth,
        label: methodLabel(GitLabConnectionMethod.OAuth),
        credentials: { instanceUrl: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            optional: true,
            placeholder: "https://gitlab.com",
            description: "Leave empty for gitlab.com."
          }
        ],
        redirect: {
          submitLabel: "Connect to GitLab",
          href: ({ values, option }) => {
            if (typeof option?.oauthClientId !== "string" || !option.oauthClientId)
              return undefined;
            const base =
              (values.credentials?.instanceUrl as string | undefined)?.trim().replace(/\/+$/, "") ||
              "https://gitlab.com";
            const query = new URLSearchParams({
              client_id: option.oauthClientId,
              redirect_uri: `${window.location.origin}/organization/app-connections/gitlab/oauth/callback`,
              response_type: "code"
            });
            return `${base}/oauth/authorize?${query}`;
          },
          unconfigured: "This server has no GitLab OAuth application configured.",
          credentials: ({ callback, stored }) => ({
            code: callback.code ?? "",
            instanceUrl: (stored.instanceUrl as string | undefined) || undefined
          })
        }
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
