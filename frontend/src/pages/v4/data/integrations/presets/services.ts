import type { AppConnectionPreset } from "@app/components/v4/patterns/app-connection-form";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AnthropicConnectionMethod } from "@app/hooks/api/appConnections/types/anthropic-connection";
import { CamundaConnectionMethod } from "@app/hooks/api/appConnections/types/camunda-connection";
import { ChecklyConnectionMethod } from "@app/hooks/api/appConnections/types/checkly-connection";
import { DatadogConnectionMethod } from "@app/hooks/api/appConnections/types/datadog-connection";
import { DaytonaConnectionMethod } from "@app/hooks/api/appConnections/types/daytona-connection";
import { DbtConnectionMethod } from "@app/hooks/api/appConnections/types/dbt-connection";
import { DevinConnectionMethod } from "@app/hooks/api/appConnections/types/devin-connection";
import { FireworksConnectionMethod } from "@app/hooks/api/appConnections/types/fireworks-connection";
import { LiteLLMConnectionMethod } from "@app/hooks/api/appConnections/types/litellm-connection";
import { OnaConnectionMethod } from "@app/hooks/api/appConnections/types/ona-connection";
import { OpenAIConnectionMethod } from "@app/hooks/api/appConnections/types/open-ai-connection";
import { OpenRouterConnectionMethod } from "@app/hooks/api/appConnections/types/open-router-connection";
import { RundeckConnectionMethod } from "@app/hooks/api/appConnections/types/rundeck-connection";
import { TriggerDevConnectionMethod } from "@app/hooks/api/appConnections/types/trigger-dev-connection";
import { WindmillConnectionMethod } from "@app/hooks/api/appConnections/types/windmill-connection";
import {
  anthropicConnectionFormSchema,
  camundaConnectionFormSchema,
  checklyConnectionFormSchema,
  datadogConnectionFormSchema,
  daytonaConnectionFormSchema,
  dbtConnectionFormSchema,
  devinConnectionFormSchema,
  fireworksConnectionFormSchema,
  liteLLMConnectionFormSchema,
  onaConnectionFormSchema,
  openAIConnectionFormSchema,
  openRouterConnectionFormSchema,
  rundeckConnectionFormSchema,
  triggerDevConnectionFormSchema,
  windmillConnectionFormSchema
} from "@app/lib/schemas/app-connections";

import { methodLabel } from "./shared";

export const SERVICE_PRESETS: Partial<Record<AppConnection, AppConnectionPreset>> = {
  [AppConnection.Camunda]: {
    app: AppConnection.Camunda,
    name: APP_CONNECTION_MAP[AppConnection.Camunda].name,
    schema: camundaConnectionFormSchema,
    methods: [
      {
        value: CamundaConnectionMethod.ClientCredentials,
        label: methodLabel(CamundaConnectionMethod.ClientCredentials),
        credentials: { clientId: "", clientSecret: "" },
        fields: [
          {
            name: "credentials.clientId",
            label: "Client ID",
            mono: true,
            placeholder: "YrBDnQYLevSe40PJ"
          },
          { name: "credentials.clientSecret", label: "Client secret", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Windmill]: {
    app: AppConnection.Windmill,
    name: APP_CONNECTION_MAP[AppConnection.Windmill].name,
    schema: windmillConnectionFormSchema,
    methods: [
      {
        value: WindmillConnectionMethod.AccessToken,
        label: methodLabel(WindmillConnectionMethod.AccessToken),
        credentials: { instanceUrl: "", accessToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            optional: true,
            placeholder: "https://app.windmill.dev",
            description: "Leave empty for Windmill Cloud."
          },
          { name: "credentials.accessToken", label: "Access token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Checkly]: {
    app: AppConnection.Checkly,
    name: APP_CONNECTION_MAP[AppConnection.Checkly].name,
    schema: checklyConnectionFormSchema,
    methods: [
      {
        value: ChecklyConnectionMethod.ApiKey,
        label: methodLabel(ChecklyConnectionMethod.ApiKey),
        credentials: { apiKey: "" },
        fields: [{ name: "credentials.apiKey", label: "Service API key", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Dbt]: {
    app: AppConnection.Dbt,
    name: APP_CONNECTION_MAP[AppConnection.Dbt].name,
    schema: dbtConnectionFormSchema,
    methods: [
      {
        value: DbtConnectionMethod.ApiToken,
        label: methodLabel(DbtConnectionMethod.ApiToken),
        credentials: { instanceUrl: "", accountId: "", apiToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://bw255.us1.dbt.com"
          },
          {
            name: "credentials.accountId",
            label: "Account ID",
            mono: true,
            placeholder: "70471823527642"
          },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.OpenRouter]: {
    app: AppConnection.OpenRouter,
    name: APP_CONNECTION_MAP[AppConnection.OpenRouter].name,
    schema: openRouterConnectionFormSchema,
    methods: [
      {
        value: OpenRouterConnectionMethod.ApiKey,
        label: methodLabel(OpenRouterConnectionMethod.ApiKey),
        credentials: { apiKey: "" },
        fields: [{ name: "credentials.apiKey", label: "Provisioning API key", kind: "secret" }]
      }
    ]
  },
  [AppConnection.OpenAI]: {
    app: AppConnection.OpenAI,
    name: APP_CONNECTION_MAP[AppConnection.OpenAI].name,
    schema: openAIConnectionFormSchema,
    methods: [
      {
        value: OpenAIConnectionMethod.ApiKey,
        label: methodLabel(OpenAIConnectionMethod.ApiKey),
        credentials: { apiKey: "" },
        fields: [{ name: "credentials.apiKey", label: "Admin API key", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Anthropic]: {
    app: AppConnection.Anthropic,
    name: APP_CONNECTION_MAP[AppConnection.Anthropic].name,
    schema: anthropicConnectionFormSchema,
    methods: [
      {
        value: AnthropicConnectionMethod.ApiKey,
        label: methodLabel(AnthropicConnectionMethod.ApiKey),
        credentials: { apiKey: "" },
        fields: [{ name: "credentials.apiKey", label: "API key", kind: "secret" }]
      }
    ]
  },
  [AppConnection.Devin]: {
    app: AppConnection.Devin,
    name: APP_CONNECTION_MAP[AppConnection.Devin].name,
    schema: devinConnectionFormSchema,
    methods: [
      {
        value: DevinConnectionMethod.ApiKey,
        label: methodLabel(DevinConnectionMethod.ApiKey),
        credentials: { apiKey: "" },
        fields: [
          {
            name: "credentials.apiKey",
            label: "API key",
            kind: "secret",
            placeholder: "cog_...",
            description: "A service-user credential with the ManageOrgSecrets permission."
          }
        ]
      }
    ]
  },
  [AppConnection.Ona]: {
    app: AppConnection.Ona,
    name: APP_CONNECTION_MAP[AppConnection.Ona].name,
    schema: onaConnectionFormSchema,
    methods: [
      {
        value: OnaConnectionMethod.PersonalAccessToken,
        label: methodLabel(OnaConnectionMethod.PersonalAccessToken),
        credentials: { personalAccessToken: "" },
        fields: [
          {
            name: "credentials.personalAccessToken",
            label: "Personal access token",
            kind: "secret"
          }
        ]
      }
    ]
  },
  [AppConnection.Datadog]: {
    app: AppConnection.Datadog,
    name: APP_CONNECTION_MAP[AppConnection.Datadog].name,
    schema: datadogConnectionFormSchema,
    methods: [
      {
        value: DatadogConnectionMethod.Token,
        label: methodLabel(DatadogConnectionMethod.Token),
        description: "Recommended.",
        credentials: { url: "", token: "" },
        fields: [
          {
            name: "credentials.url",
            label: "Datadog URL",
            mono: true,
            placeholder: "https://api.datadoghq.com"
          },
          { name: "credentials.token", label: "Service access token", kind: "secret" }
        ]
      },
      {
        value: DatadogConnectionMethod.ApiKey,
        label: methodLabel(DatadogConnectionMethod.ApiKey),
        credentials: { url: "", apiKey: "", applicationKey: "" },
        fields: [
          {
            name: "credentials.url",
            label: "Datadog URL",
            mono: true,
            placeholder: "https://api.datadoghq.com"
          },
          { name: "credentials.apiKey", label: "API key", kind: "secret" },
          { name: "credentials.applicationKey", label: "Application key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.TriggerDev]: {
    app: AppConnection.TriggerDev,
    name: APP_CONNECTION_MAP[AppConnection.TriggerDev].name,
    schema: triggerDevConnectionFormSchema,
    methods: [
      {
        value: TriggerDevConnectionMethod.ApiKey,
        label: methodLabel(TriggerDevConnectionMethod.ApiKey),
        credentials: { instanceUrl: "", apiKey: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            optional: true,
            placeholder: "https://api.trigger.dev",
            description: "Leave empty for Trigger.dev Cloud."
          },
          { name: "credentials.apiKey", label: "Personal access token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Rundeck]: {
    app: AppConnection.Rundeck,
    name: APP_CONNECTION_MAP[AppConnection.Rundeck].name,
    schema: rundeckConnectionFormSchema,
    methods: [
      {
        value: RundeckConnectionMethod.ApiToken,
        label: methodLabel(RundeckConnectionMethod.ApiToken),
        credentials: { instanceUrl: "", apiToken: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://rundeck.example.com"
          },
          { name: "credentials.apiToken", label: "API token", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.LiteLLM]: {
    app: AppConnection.LiteLLM,
    name: APP_CONNECTION_MAP[AppConnection.LiteLLM].name,
    schema: liteLLMConnectionFormSchema,
    methods: [
      {
        value: LiteLLMConnectionMethod.ApiKey,
        label: methodLabel(LiteLLMConnectionMethod.ApiKey),
        credentials: { instanceUrl: "", apiKey: "" },
        fields: [
          {
            name: "credentials.instanceUrl",
            label: "Instance URL",
            mono: true,
            placeholder: "https://litellm.example.com"
          },
          { name: "credentials.apiKey", label: "API key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Fireworks]: {
    app: AppConnection.Fireworks,
    name: APP_CONNECTION_MAP[AppConnection.Fireworks].name,
    schema: fireworksConnectionFormSchema,
    methods: [
      {
        value: FireworksConnectionMethod.ApiKey,
        label: methodLabel(FireworksConnectionMethod.ApiKey),
        credentials: { accountId: "", apiKey: "" },
        fields: [
          { name: "credentials.accountId", label: "Account ID", mono: true },
          { name: "credentials.apiKey", label: "API key", kind: "secret" }
        ]
      }
    ]
  },
  [AppConnection.Daytona]: {
    app: AppConnection.Daytona,
    name: APP_CONNECTION_MAP[AppConnection.Daytona].name,
    schema: daytonaConnectionFormSchema,
    methods: [
      {
        value: DaytonaConnectionMethod.ApiKey,
        label: methodLabel(DaytonaConnectionMethod.ApiKey),
        credentials: { apiKey: "" },
        fields: [
          {
            name: "credentials.apiKey",
            label: "API key",
            kind: "secret",
            description:
              "Needs the manage:secrets permission. Decides which Daytona organization secrets are synced to."
          }
        ]
      }
    ]
  }
};
