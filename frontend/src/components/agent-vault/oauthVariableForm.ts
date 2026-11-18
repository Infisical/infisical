import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthStatus,
  AgentVaultVariableType
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultOauthVariable,
  TAgentVaultOauthVariableSettingsInput,
  TAgentVaultOauthVariableSettingsUpdate,
  TAgentVaultOauthVariableSignInStart
} from "@app/hooks/api/agentVault/types";

import { oauthClientIdSchema, oauthClientSecretSchema } from "./service-sheet/serviceSchema";

export const CREATE_OAUTH_VARIABLE_TITLE = "Create OAuth Variable";

/** The OAuth fields of the variable form. Every one is text, so an empty field means "not set". */
export type TOAuthVariableFormValues = {
  serverUrl: string;
  scopes: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  issuer: string;
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod | "";
  clientName: string;
  redirectUri: string;
};

/** The whole variable form: a text variable uses key and value, an OAuth variable key and the OAuth fields. */
export type TVariableFormValues = TOAuthVariableFormValues & {
  type: AgentVaultVariableType;
  key: string;
  value: string;
};

export const BLANK_OAUTH_VARIABLE_FORM: TOAuthVariableFormValues = {
  serverUrl: "",
  scopes: "",
  clientId: "",
  clientSecret: "",
  authorizationEndpoint: "",
  tokenEndpoint: "",
  issuer: "",
  tokenEndpointAuthMethod: "",
  clientName: "",
  redirectUri: ""
};

export const oauthVariableFormValuesOf = (
  oauth: TAgentVaultOauthVariable | null | undefined
): TOAuthVariableFormValues =>
  oauth
    ? {
        serverUrl: oauth.serverUrl ?? "",
        scopes: oauth.scopes.join(" "),
        clientId: oauth.clientId ?? "",
        clientSecret: "",
        authorizationEndpoint: oauth.authorizationEndpoint ?? "",
        tokenEndpoint: oauth.tokenEndpoint ?? "",
        issuer: oauth.issuer ?? "",
        tokenEndpointAuthMethod: oauth.tokenEndpointAuthMethod ?? "",
        clientName: oauth.clientName ?? "",
        redirectUri: oauth.redirectUri ?? ""
      }
    : BLANK_OAUTH_VARIABLE_FORM;

export const OAUTH_AUTH_METHOD_LABELS: Record<AgentVaultOauthClientAuthMethod, string> = {
  [AgentVaultOauthClientAuthMethod.ClientSecretBasic]: "Client Secret Basic",
  [AgentVaultOauthClientAuthMethod.ClientSecretPost]: "Client Secret Post",
  [AgentVaultOauthClientAuthMethod.None]: "None"
};

const MAX_OAUTH_SCOPES = 200;
const MAX_OAUTH_SCOPE_LENGTH = 256;
const MAX_OAUTH_URL_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 128;
// RFC 6749's scope-token, which the API requires.
const OAUTH_SCOPE_TOKEN_RE = /^[\x21\x23-\x5b\x5d-\x7e]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;

export const parseOAuthScopes = (text: string) => [...new Set(text.split(/\s+/).filter(Boolean))];

// A comma is valid in a scope, so "read, write" is not refused, but it is rarely meant.
export const hasCommaSeparatedScope = (text: string) =>
  parseOAuthScopes(text).some((scope) => scope.endsWith(","));

const isManual = (values: Pick<TOAuthVariableFormValues, "authorizationEndpoint">) =>
  Boolean(values.authorizationEndpoint.trim());

// Mirrors isHttpsUrl on the backend, so a URL the API would refuse is marked on its field.
export const oauthUrlError = (value: string, label: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_OAUTH_URL_LENGTH) {
    return `The ${label} can be at most ${MAX_OAUTH_URL_LENGTH} characters.`;
  }
  if (!/^[\x21-\x7e]+$/.test(trimmed)) {
    return `The ${label} can only contain printable ASCII characters, without spaces.`;
  }
  if (!/^https:\/\//i.test(trimmed)) return `The ${label} must start with https://.`;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return `Enter a full URL, as in https://auth.example.com.`;
  }
  if (url.username || url.password) return `Remove the username and password from the ${label}.`;
  if (trimmed.includes("#")) return `Remove the # fragment from the ${label}.`;
  return null;
};

type TIssue = { field: keyof TOAuthVariableFormValues; message: string };

/** Every rule the API applies to an OAuth variable's settings, worded for the field it concerns. */
export const oauthVariableFormIssues = (values: TOAuthVariableFormValues): TIssue[] => {
  const issues: TIssue[] = [];
  const add = (field: TIssue["field"], message: string | null) => {
    if (message && !issues.some((issue) => issue.field === field)) issues.push({ field, message });
  };

  add("serverUrl", oauthUrlError(values.serverUrl, "server URL"));
  add("authorizationEndpoint", oauthUrlError(values.authorizationEndpoint, "authorization URL"));
  add("tokenEndpoint", oauthUrlError(values.tokenEndpoint, "token URL"));
  add("issuer", oauthUrlError(values.issuer, "issuer"));
  add("redirectUri", oauthUrlError(values.redirectUri, "redirect URI"));

  const manual = isManual(values);
  const hasTokenEndpoint = Boolean(values.tokenEndpoint.trim());
  const clientId = values.clientId.trim();
  const scopes = parseOAuthScopes(values.scopes);

  if (manual && !hasTokenEndpoint) {
    add("tokenEndpoint", "Enter the token URL too, or clear the authorization URL.");
  }
  if (!manual && hasTokenEndpoint) {
    add("authorizationEndpoint", "Enter the authorization URL too, or clear the token URL.");
  }
  if (!manual && !hasTokenEndpoint) {
    if (!values.serverUrl.trim()) {
      add(
        "serverUrl",
        "Enter the server URL, or the authorization and token URLs under Advanced Options."
      );
    }
    if (values.issuer.trim()) {
      add("issuer", "The issuer is found from the server URL. Set it only with the URLs above.");
    }
  }
  if (manual && !clientId) {
    add("clientId", "Enter your OAuth app's client ID. A provider set up by hand needs one.");
  }
  if (manual && !scopes.length) {
    add("scopes", "Enter at least one scope. A provider set up by hand doesn't list them.");
  }

  const badScope = scopes.find(
    (scope) => scope.length > MAX_OAUTH_SCOPE_LENGTH || !OAUTH_SCOPE_TOKEN_RE.test(scope)
  );
  if (badScope !== undefined) {
    add(
      "scopes",
      `"${badScope}" isn't a valid scope. A scope is at most ${MAX_OAUTH_SCOPE_LENGTH} characters, without quotes or backslashes.`
    );
  }
  if (scopes.length > MAX_OAUTH_SCOPES) add("scopes", `Enter at most ${MAX_OAUTH_SCOPES} scopes.`);

  const clientIdResult = oauthClientIdSchema.safeParse(values.clientId);
  if (!clientIdResult.success) add("clientId", clientIdResult.error.issues[0].message);
  const clientSecretResult = oauthClientSecretSchema.safeParse(values.clientSecret);
  if (!clientSecretResult.success) add("clientSecret", clientSecretResult.error.issues[0].message);
  if (values.clientSecret && !clientId) {
    add("clientId", "Enter the client ID this secret belongs to.");
  }
  if (values.tokenEndpointAuthMethod && !clientId) {
    add("tokenEndpointAuthMethod", "Choose a method only with your own OAuth app's client ID.");
  }

  const clientName = values.clientName.trim();
  if (clientName.length > MAX_CLIENT_NAME_LENGTH) {
    add("clientName", `A client name can be at most ${MAX_CLIENT_NAME_LENGTH} characters.`);
  } else if (CONTROL_CHARS_RE.test(clientName)) {
    add("clientName", "A client name can't contain line breaks or other control characters.");
  }

  return issues;
};

const text = (value: string) => value.trim() || undefined;

/** The settings a new OAuth variable is created with. The client secret is sent only when a sign-in starts. */
export const buildOAuthVariableSettings = (
  values: TOAuthVariableFormValues
): TAgentVaultOauthVariableSettingsInput => {
  const manual = isManual(values);
  const scopes = parseOAuthScopes(values.scopes);
  const settings: TAgentVaultOauthVariableSettingsInput = {
    serverUrl: text(values.serverUrl),
    authorizationEndpoint: manual ? text(values.authorizationEndpoint) : undefined,
    tokenEndpoint: manual ? text(values.tokenEndpoint) : undefined,
    issuer: manual ? text(values.issuer) : undefined,
    clientId: text(values.clientId),
    tokenEndpointAuthMethod: values.tokenEndpointAuthMethod || undefined,
    scopes: scopes.length ? scopes : undefined,
    clientName: text(values.clientName),
    redirectUri: text(values.redirectUri)
  };
  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => value !== undefined)
  ) as TAgentVaultOauthVariableSettingsInput;
};

/** The settings an edit changes, with null for a setting cleared, or undefined when nothing changed. */
export const buildOAuthVariableSettingsUpdate = (
  current: TAgentVaultOauthVariable,
  values: TOAuthVariableFormValues
): TAgentVaultOauthVariableSettingsUpdate | undefined => {
  const next = buildOAuthVariableSettings(values);
  const update: TAgentVaultOauthVariableSettingsUpdate = {};
  const textFields = [
    "serverUrl",
    "authorizationEndpoint",
    "tokenEndpoint",
    "issuer",
    "clientId",
    "tokenEndpointAuthMethod",
    "clientName",
    "redirectUri"
  ] as const;
  textFields.forEach((field) => {
    const before = current[field] ?? null;
    const after = next[field] ?? null;
    if (before !== after) Object.assign(update, { [field]: after });
  });
  const scopes = next.scopes ?? [];
  if (scopes.join(" ") !== current.scopes.join(" ")) update.scopes = scopes;
  // The form has no resource field, and the API takes one only with endpoints set by hand, so switching to discovery
  // has to clear it too.
  if (current.resource && !next.authorizationEndpoint && !next.tokenEndpoint)
    update.resource = null;
  return Object.keys(update).length ? update : undefined;
};

// The settings the API binds a variable's sign-in to. Saving a change to one disconnects the variable and drops its
// client secret.
const SIGN_IN_FIELDS = [
  "serverUrl",
  "authorizationEndpoint",
  "tokenEndpoint",
  "issuer",
  "clientId",
  "tokenEndpointAuthMethod"
] as const;

export const isOAuthVariableSignInChanged = (
  current: TAgentVaultOauthVariable,
  values: TOAuthVariableFormValues
) => {
  const update = buildOAuthVariableSettingsUpdate(current, values);
  return Boolean(update) && SIGN_IN_FIELDS.some((field) => update?.[field] !== undefined);
};

export const OAUTH_CLIENT_SECRET_REQUIRED_MESSAGE =
  "Enter the client secret again. Changing sign-in settings clears it.";

/**
 * Whether a sign-in from these values has to send the client secret: the variable's own OAuth app needs one, and the
 * stored one is gone or about to be, since a changed sign-in setting clears it and a variable that isn't connected
 * has none. Checked on Authorize only, so settings can still be saved on their own. A redirect URI set for an app
 * means the secret comes with that app's sign-in.
 */
export const isOAuthClientSecretRequired = (
  current: TAgentVaultOauthVariable,
  values: TOAuthVariableFormValues
) =>
  // Only an explicit method says a secret exists: with Automatic the app may be public, and the view can't tell.
  Boolean(current.clientId) &&
  Boolean(current.tokenEndpointAuthMethod) &&
  current.tokenEndpointAuthMethod !== AgentVaultOauthClientAuthMethod.None &&
  Boolean(values.clientId.trim()) &&
  Boolean(values.tokenEndpointAuthMethod) &&
  values.tokenEndpointAuthMethod !== AgentVaultOauthClientAuthMethod.None &&
  !values.redirectUri.trim() &&
  !values.clientSecret &&
  (current.status === AgentVaultOauthStatus.NotConnected ||
    isOAuthVariableSignInChanged(current, values));

/**
 * Fills the fields a sign-in found it needs, leaving anything typed alone: guessed endpoints are only a suggestion,
 * so they go into the manual fields for the user to confirm.
 */
export const applySignInPrefill = (
  values: TOAuthVariableFormValues,
  prefill: NonNullable<TAgentVaultOauthVariableSignInStart["prefill"]>
): Partial<TOAuthVariableFormValues> => ({
  ...(values.authorizationEndpoint.trim()
    ? {}
    : { authorizationEndpoint: prefill.authorizationEndpoint }),
  ...(values.tokenEndpoint.trim() ? {} : { tokenEndpoint: prefill.tokenEndpoint }),
  ...(values.issuer.trim() || !prefill.issuer ? {} : { issuer: prefill.issuer }),
  ...(values.scopes.trim() || !prefill.scopes.length ? {} : { scopes: prefill.scopes.join(" ") })
});

export const changedVariableFormFields = (
  before: TVariableFormValues,
  after: TVariableFormValues
): (keyof TVariableFormValues)[] =>
  (Object.keys(after) as (keyof TVariableFormValues)[]).filter(
    (field) => before[field] !== after[field]
  );
