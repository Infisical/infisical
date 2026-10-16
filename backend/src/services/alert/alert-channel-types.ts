import RE2 from "re2";
import { z } from "zod";

import { PAGERDUTY_INTEGRATION_KEY_ERROR, pagerDutyIntegrationKeyRegex } from "@app/lib/pagerduty/integration-key";
import { TSmtpService } from "@app/services/smtp/smtp-service";

export const ALERT_CHANNEL_HTTP_TIMEOUT = 7 * 1000;

export enum AlertChannelType {
  EMAIL = "email",
  SLACK = "slack",
  WEBHOOK = "webhook",
  PAGERDUTY = "pagerduty"
}

// Channel types that address individual principals and therefore cannot deliver without recipients.
// Kept here rather than read off ALERT_CHANNEL_REGISTRY so the DALs don't have to pull in the send
// implementations; alert-channels.test.ts asserts the two stay in agreement.
export const DIRECTED_ALERT_CHANNEL_TYPES: AlertChannelType[] = [AlertChannelType.EMAIL];

export type TAlertSeverity = "critical" | "error" | "warning" | "info";

export type TAlertItem = {
  id: string;
  title: string; // primary label (e.g. certificate common name, client-secret description)
  identifier?: string; // secondary label (e.g. serial number, client-secret id)
  fields?: Array<{ label: string; value: string }>; // extra display key-values (expiry date, days left, reason)
  summary?: string;
  severity?: TAlertSeverity;
  resource?: Record<string, unknown>;
};

export type TAlertPayload = {
  alert: {
    id: string;
    name: string;
    orgId: string;
    projectId?: string;
    resourceType: string; // dot-namespaced, e.g. "pki.certificate"
    resourceId?: string;
    condition?: string; // display label for the "when", e.g. "30d"
    viewUrl: string; // deep link into the app, built by the provider
  };
  eventKey: string; // dot-namespaced event, e.g. "pki.certificate.expiration"
  eventLabel: string; // human label, e.g. "Expiration"
  webhookType: string; // CloudEvents `type` string, e.g. "com.infisical.pki.certificate.expiration"
  webhookSource?: string;
  resourceKind: string; // display noun, e.g. "Certificate", "Client Secret"
  resourceOwnerKind: string; // display noun of the entity the alert is configured on, e.g. "Machine Identity"
  severity: TAlertSeverity;
  summary: string; // one-line human summary
  items: TAlertItem[];
};

export type TChannelTargetResult = { targetId: string; success: boolean; error?: string };

export type TChannelResult = { success: boolean; error?: string; targetResults?: TChannelTargetResult[] };

export type TAlertRecipient = {
  userId?: string;
  email: string;
  firstName?: string | null;
};

export type TAlertChannelDeps = {
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TAlertChannelSendContext = {
  channelId: string;
  config: unknown; // raw config; each channel validates against its own schema
  payload: TAlertPayload;
  recipient?: TAlertRecipient; // present for directed channels
  deps: TAlertChannelDeps;
};

export type TAlertChannelDefinition = {
  type: AlertChannelType;
  directed: boolean;
  secretFields: string[];
  configSchema: z.ZodTypeAny;
  maxTargetsPerRun?: number;
  assertStoredSecretsReusable?: (
    incomingConfig: Record<string, unknown>,
    storedConfig: Record<string, unknown>
  ) => void;
  send: (ctx: TAlertChannelSendContext) => Promise<TChannelResult>;
};

export const EmailChannelConfigSchema = z.object({}).strip();

const WEBHOOK_MAX_HEADERS = 20;

export const WEBHOOK_MAX_HEADERS_LENGTH = 4096;

export enum WebhookAuthType {
  BEARER = "bearer",
  BASIC = "basic",
  HEADER = "header"
}

const WEBHOOK_AUTH_FIELDS_BY_TYPE: Record<WebhookAuthType, string[]> = {
  [WebhookAuthType.BEARER]: ["authCredentials"],
  [WebhookAuthType.BASIC]: ["basicUsername", "basicPassword"],
  [WebhookAuthType.HEADER]: ["authHeaderName", "authHeaderValue"]
};

const WEBHOOK_AUTH_FIELDS = Object.values(WEBHOOK_AUTH_FIELDS_BY_TYPE).flat();

export const WEBHOOK_AUTH_SECRET_FIELD_BY_TYPE: Record<WebhookAuthType, string> = {
  [WebhookAuthType.BEARER]: "authCredentials",
  [WebhookAuthType.BASIC]: "basicPassword",
  [WebhookAuthType.HEADER]: "authHeaderValue"
};

const WEBHOOK_RESERVED_HEADERS = [
  "content-type",
  "x-infisical-signature",
  "content-length",
  "transfer-encoding",
  "connection",
  "host"
];

const httpHeaderNameRegex = new RE2("^[A-Za-z0-9!#$%&'*+.^_`|~-]+$");
const httpHeaderValueRegex = new RE2("^[\\t\\x20-\\x7e\\x80-\\xff]*$");

const UNSENDABLE_CHARACTER_MESSAGE =
  "has a character that can't be sent in an HTTP header, such as an emoji, a control character, or an invisible space. Re-enter the value";

const headerNameSchema = (reserved: string[]) =>
  z
    .string()
    .trim()
    .min(1, "Header names cannot be empty")
    .max(128, "Header names cannot be longer than 128 characters")
    .refine(
      (key) => httpHeaderNameRegex.test(key),
      "Header names can only contain letters, digits, and -_.!#$%&'*+^`|~"
    )
    .refine(
      (key) => !reserved.includes(key.toLowerCase()),
      (key) => ({
        message:
          key.toLowerCase() === "authorization"
            ? "Use Authentication to set the 'Authorization' header"
            : `Header '${key}' is set by Infisical and cannot be overridden`
      })
    );

const headerValueSchema = (label: string) =>
  z
    .string()
    .max(4096, `${label} cannot be longer than 4096 characters`)
    .refine((value) => httpHeaderValueRegex.test(value), `${label} ${UNSENDABLE_CHARACTER_MESSAGE}`);

const WebhookChannelHeaderSchema = z
  .object({
    key: headerNameSchema([...WEBHOOK_RESERVED_HEADERS, "authorization"]),
    value: z
      .string()
      .min(1, "Header values cannot be empty")
      .max(4096, "Header values cannot be longer than 4096 characters")
  })
  .refine(
    (header) => httpHeaderValueRegex.test(header.value),
    (header) => ({ message: `The value for header '${header.key}' ${UNSENDABLE_CHARACTER_MESSAGE}`, path: ["value"] })
  );

export const WebhookChannelConfigSchema = z
  .object({
    url: z
      .string()
      .max(2048)
      .url()
      .refine((url) => url.startsWith("https://"), "Webhook URL must use HTTPS"),
    signingSecret: z.string().max(256).optional().nullable(),
    authType: z.nativeEnum(WebhookAuthType).optional(),
    authCredentials: headerValueSchema("The token").optional(),
    basicUsername: z
      .string()
      .max(256, "The username cannot be longer than 256 characters")
      .refine((username) => !username.includes(":"), "The username cannot contain ':'")
      .optional(),
    basicPassword: z.string().max(256, "The password cannot be longer than 256 characters").optional(),
    authHeaderName: headerNameSchema(WEBHOOK_RESERVED_HEADERS).optional(),
    authHeaderValue: headerValueSchema("The API key").optional(),
    headers: z
      .array(WebhookChannelHeaderSchema)
      .max(WEBHOOK_MAX_HEADERS, `A webhook channel can have at most ${WEBHOOK_MAX_HEADERS} headers`)
      .optional()
      .refine(
        (headers) => {
          const names = (headers ?? []).map((header) => header.key.toLowerCase());
          return new Set(names).size === names.length;
        },
        { message: "Header names must be unique" }
      )
  })
  .superRefine((config, ctx) => {
    const require = (field: keyof typeof config, message: string) => {
      if (!config[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    };

    let authLength = 0;
    switch (config.authType) {
      case WebhookAuthType.BEARER:
        require("authCredentials", "Enter a token for bearer authentication");
        authLength = config.authCredentials?.length ?? 0;
        break;
      case WebhookAuthType.BASIC:
        require("basicUsername", "Enter a username for basic authentication");
        require("basicPassword", "Enter a password for basic authentication");
        authLength = (config.basicUsername?.length ?? 0) + (config.basicPassword?.length ?? 0);
        break;
      case WebhookAuthType.HEADER: {
        require("authHeaderName", "Enter a header name for API key authentication");
        require("authHeaderValue", "Enter an API key for API key authentication");
        authLength = (config.authHeaderName?.length ?? 0) + (config.authHeaderValue?.length ?? 0);
        const authHeaderName = config.authHeaderName?.toLowerCase();
        if (authHeaderName && config.headers?.some((header) => header.key.toLowerCase() === authHeaderName)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["headers"],
            message: `Header '${config.authHeaderName}' is already set by Authentication`
          });
        }
        break;
      }
      default:
        break;
    }

    const headersLength = (config.headers ?? []).reduce(
      (total, header) => total + header.key.length + header.value.length,
      0
    );
    if (authLength + headersLength > WEBHOOK_MAX_HEADERS_LENGTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["headers"],
        message: `Authentication and custom headers can add up to at most ${WEBHOOK_MAX_HEADERS_LENGTH} characters`
      });
    }
  })
  .transform((config) => {
    const kept = new Set(config.authType ? WEBHOOK_AUTH_FIELDS_BY_TYPE[config.authType] : []);
    return Object.fromEntries(
      Object.entries(config).filter(([field]) => kept.has(field) || !WEBHOOK_AUTH_FIELDS.includes(field))
    ) as typeof config;
  });

export const SlackChannelConfigSchema = z.object({
  webhookUrl: z
    .string()
    .max(2048)
    .url()
    .refine((url) => url.startsWith("https://"), "Slack webhook URL must use HTTPS")
    .refine((url) => {
      try {
        return new URL(url).hostname === "hooks.slack.com";
      } catch {
        return false;
      }
    }, "Slack webhook URL must be from hooks.slack.com")
});

export const PagerDutyChannelConfigSchema = z.object({
  integrationKey: z
    .string()
    .max(256)
    .refine((val) => pagerDutyIntegrationKeyRegex.test(val), PAGERDUTY_INTEGRATION_KEY_ERROR)
});
