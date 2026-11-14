import { z } from "zod";

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

import { genericAppConnectionFieldsSchema } from "./base";

const camundaRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Camunda)
});

export const camundaConnectionFormSchema = z.discriminatedUnion("method", [
  camundaRootSchema.extend({
    method: z.literal(CamundaConnectionMethod.ClientCredentials),
    credentials: z.object({
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client secret required")
    })
  })
]);

const windmillRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Windmill)
});

export const windmillConnectionFormSchema = z.discriminatedUnion("method", [
  windmillRootSchema.extend({
    method: z.literal(WindmillConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().trim().min(1, "Access Token required"),
      instanceUrl: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .refine((value) => (!value ? true : z.string().url().safeParse(value).success), {
          message: "Invalid instance URL"
        })
        .optional()
    })
  })
]);

const checklyRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Checkly)
});

export const checklyConnectionFormSchema = z.discriminatedUnion("method", [
  checklyRootSchema.extend({
    method: z.literal(ChecklyConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "Service API Key required")
    })
  })
]);

const dbtRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Dbt)
});

export const dbtConnectionFormSchema = z.discriminatedUnion("method", [
  dbtRootSchema.extend({
    method: z.literal(DbtConnectionMethod.ApiToken),
    credentials: z.object({
      apiToken: z.string().trim().min(1, "API Token required"),
      instanceUrl: z.string().trim().min(1, "Instance URL required"),
      accountId: z.string().trim().min(1, "Account ID required")
    })
  })
]);

const openRouterRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OpenRouter)
});

export const openRouterConnectionFormSchema = z.discriminatedUnion("method", [
  openRouterRootSchema.extend({
    method: z.literal(OpenRouterConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required")
    })
  })
]);

const openAIRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OpenAI)
});

export const openAIConnectionFormSchema = z.discriminatedUnion("method", [
  openAIRootSchema.extend({
    method: z.literal(OpenAIConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required")
    })
  })
]);

const anthropicRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Anthropic)
});

export const anthropicConnectionFormSchema = z.discriminatedUnion("method", [
  anthropicRootSchema.extend({
    method: z.literal(AnthropicConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required")
    })
  })
]);

const devinRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Devin)
});

export const devinConnectionFormSchema = z.discriminatedUnion("method", [
  devinRootSchema.extend({
    method: z.literal(DevinConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z
        .string()
        .trim()
        .min(1, "API Key required")
        .startsWith("cog_", "API Key must start with 'cog_'")
    })
  })
]);

const onaRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Ona)
});

export const onaConnectionFormSchema = z.discriminatedUnion("method", [
  onaRootSchema.extend({
    method: z.literal(OnaConnectionMethod.PersonalAccessToken),
    credentials: z.object({
      personalAccessToken: z.string().trim().min(1, "Personal Access Token required")
    })
  })
]);

const datadogRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Datadog)
});

const datadogUrlSchema = z
  .string()
  .trim()
  .url("Invalid Datadog URL")
  .min(1, "URL required")
  .max(255);

export const datadogConnectionFormSchema = z.discriminatedUnion("method", [
  datadogRootSchema.extend({
    method: z.literal(DatadogConnectionMethod.Token),
    credentials: z.object({
      url: datadogUrlSchema,
      token: z.string().trim().min(1, "Token required")
    })
  }),
  datadogRootSchema.extend({
    method: z.literal(DatadogConnectionMethod.ApiKey),
    credentials: z.object({
      url: datadogUrlSchema,
      apiKey: z.string().trim().min(1, "API Key required"),
      applicationKey: z.string().trim().min(1, "Application Key required")
    })
  })
]);

const triggerDevRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.TriggerDev)
});

export const triggerDevConnectionFormSchema = z.discriminatedUnion("method", [
  triggerDevRootSchema.extend({
    method: z.literal(TriggerDevConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required"),
      instanceUrl: z.string().url().optional()
    })
  })
]);

const rundeckRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Rundeck)
});

export const rundeckConnectionFormSchema = z.discriminatedUnion("method", [
  rundeckRootSchema.extend({
    method: z.literal(RundeckConnectionMethod.ApiToken),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid Instance URL")
        .min(1, "Instance URL required")
        .max(255),
      apiToken: z.string().trim().min(1, "API Token required")
    })
  })
]);

const liteLLMRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.LiteLLM)
});

export const liteLLMConnectionFormSchema = z.discriminatedUnion("method", [
  liteLLMRootSchema.extend({
    method: z.literal(LiteLLMConnectionMethod.ApiKey),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid Instance URL")
        .min(1, "Instance URL required")
        .max(255),
      apiKey: z.string().trim().min(1, "API Key required")
    })
  })
]);

const fireworksRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Fireworks)
});

export const fireworksConnectionFormSchema = z.discriminatedUnion("method", [
  fireworksRootSchema.extend({
    method: z.literal(FireworksConnectionMethod.ApiKey),
    credentials: z.object({
      accountId: z.string().trim().min(1, "Account ID required"),
      apiKey: z.string().trim().min(1, "API Key required")
    })
  })
]);

const daytonaRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Daytona)
});

export const daytonaConnectionFormSchema = z.discriminatedUnion("method", [
  daytonaRootSchema.extend({
    method: z.literal(DaytonaConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required").max(500)
    })
  })
]);
