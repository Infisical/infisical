import {
  AgentVaultCredentialType,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultCredentialInput,
  TAgentVaultCredentialUpdate,
  TAgentVaultOauthCredentialInput,
  TAgentVaultService,
  TCreateAgentVaultServiceDTO,
  TListAgentVaultMcpToolsDTO,
  TUpdateAgentVaultServiceDTO
} from "@app/hooks/api/agentVault/types";

import {
  hostOf,
  isAllMethods,
  isCredentialMemberProvided,
  isMemberProvidedOAuthService,
  McpToolScope,
  newOAuthAuthorizationId,
  storedMemberFields,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";

const bearerCredential = (data: TServiceForm) => ({
  type: AgentVaultCredentialType.Bearer as const,
  headerName: data.headerName || undefined,
  headerPrefix: data.headerPrefix ?? "",
  value: data.secret ?? ""
});

const memberFieldsOf = (data: TServiceForm) => {
  const isMemberProvided = (field: TAgentVaultMemberProvidedField) =>
    data.memberProvidedFields.includes(field);
  return {
    bearer: isMemberProvided(AgentVaultVariableReferenceField.CredentialValue)
      ? [AgentVaultVariableReferenceField.CredentialValue as const]
      : [],
    basic: (
      [
        AgentVaultVariableReferenceField.CredentialUsername,
        AgentVaultVariableReferenceField.CredentialValue
      ] as TAgentVaultMemberProvidedField[]
    ).filter(isMemberProvided),
    isMemberProvided
  };
};

const buildBearerCredential = (data: TServiceForm) => {
  const { bearer } = memberFieldsOf(data);
  return {
    ...bearerCredential(data),
    value: bearer.length ? undefined : (data.secret ?? ""),
    memberProvidedFields: bearer
  };
};

// A member-provided field is sent without a value: each member sets their own.
const buildHttpCredential = (data: TServiceForm): TAgentVaultCredentialInput => {
  const { basic, isMemberProvided } = memberFieldsOf(data);
  if (data.credentialType === AgentVaultCredentialType.Passthrough) {
    return { type: AgentVaultCredentialType.Passthrough };
  }
  if (data.credentialType === AgentVaultCredentialType.Basic) {
    return {
      type: AgentVaultCredentialType.Basic,
      username: isMemberProvided(AgentVaultVariableReferenceField.CredentialUsername)
        ? undefined
        : (data.username ?? ""),
      password: isMemberProvided(AgentVaultVariableReferenceField.CredentialValue)
        ? undefined
        : (data.secret ?? ""),
      memberProvidedFields: basic
    };
  }
  return buildBearerCredential(data);
};

// A field left at the sentinel is omitted so the stored value is kept. A bearer token can never be
// empty, so an empty one is omitted too, where an empty Basic half clears that half.
const buildHttpCredentialPatch = (data: TServiceForm): TAgentVaultCredentialUpdate => {
  const { bearer, basic, isMemberProvided } = memberFieldsOf(data);
  if (data.credentialType === AgentVaultCredentialType.Passthrough) {
    return { type: AgentVaultCredentialType.Passthrough };
  }
  const isSecretUntouched = data.secret === UNCHANGED_SECRET;

  if (data.credentialType === AgentVaultCredentialType.Basic) {
    return {
      type: AgentVaultCredentialType.Basic,
      username:
        isMemberProvided(AgentVaultVariableReferenceField.CredentialUsername) ||
        data.username === UNCHANGED_SECRET
          ? undefined
          : (data.username ?? ""),
      password:
        isMemberProvided(AgentVaultVariableReferenceField.CredentialValue) || isSecretUntouched
          ? undefined
          : (data.secret ?? ""),
      memberProvidedFields: basic
    };
  }
  return {
    type: AgentVaultCredentialType.Bearer,
    headerName: data.headerName || "Authorization",
    headerPrefix: data.headerPrefix ?? "",
    value: bearer.length || isSecretUntouched || !data.secret ? undefined : data.secret,
    memberProvidedFields: bearer
  };
};

const MEMBER_CREDENTIAL_FIELDS = [AgentVaultVariableReferenceField.CredentialValue as const];

const MEMBER_OAUTH: TAgentVaultOauthCredentialInput = {
  type: AgentVaultCredentialType.OAuth,
  memberProvidedFields: MEMBER_CREDENTIAL_FIELDS
};

const formClientId = (data: TServiceForm) => (data.oauthClientId ?? "").trim();

// The client each member signs in with: only an admin-entered client is sent, and its secret only when typed.
const memberOAuthClient = (data: TServiceForm) => {
  const clientId = formClientId(data);
  if (!clientId) return {};
  return { clientId, ...(data.oauthClientSecret ? { clientSecret: data.oauthClientSecret } : {}) };
};

const storedMemberClientId = (service?: TAgentVaultService | null) =>
  service?.credential.type === AgentVaultCredentialType.OAuth
    ? (service.credential.clientId ?? "")
    : "";

/** Whether this save changes the client a member-provided OAuth service's members sign in with. */
const isMemberOAuthClientChanged = (data: TServiceForm, service?: TAgentVaultService | null) =>
  formClientId(data) !== storedMemberClientId(service) || Boolean(data.oauthClientSecret);

const buildMcpCredential = (data: TServiceForm) => {
  if (data.credentialType !== AgentVaultCredentialType.OAuth) return buildBearerCredential(data);
  if (isCredentialMemberProvided(data)) return { ...MEMBER_OAUTH, ...memberOAuthClient(data) };
  return {
    type: AgentVaultCredentialType.OAuth as const,
    authorizationId: newOAuthAuthorizationId(data) ?? ""
  };
};

// A shared OAuth credential has nothing to change without a new authorization made for the current URL, so it is
// left out and the stored tokens stay. A member-provided one is left out unless its client changes: a new server URL
// alone is applied from the stored client.
const buildMcpCredentialPatch = (
  data: TServiceForm,
  service: TAgentVaultService | null
): TAgentVaultCredentialUpdate | undefined => {
  if (data.credentialType !== AgentVaultCredentialType.OAuth) return buildHttpCredentialPatch(data);
  const wasMemberProvided = isMemberProvidedOAuthService(service);
  if (isCredentialMemberProvided(data)) {
    if (!wasMemberProvided) return { ...MEMBER_OAUTH, ...memberOAuthClient(data) };
    if (!isMemberOAuthClientChanged(data, service)) return undefined;
    // Clearing an admin-entered client goes back to automatic registration, which has to be asked for.
    if (!formClientId(data)) return { ...MEMBER_OAUTH, registration: "dynamic" };
    return { ...MEMBER_OAUTH, ...memberOAuthClient(data) };
  }
  const authorizationId = newOAuthAuthorizationId(data);
  if (!authorizationId) return undefined;
  return {
    type: AgentVaultCredentialType.OAuth,
    authorizationId,
    ...(wasMemberProvided ? { memberProvidedFields: [] } : {})
  };
};

const withCredential = (credential: TAgentVaultCredentialUpdate | undefined) =>
  credential ? { credential } : {};

const buildCustomHeaders = (data: TServiceForm) =>
  data.customHeaders.map((header) => ({
    ...(header.id ? { id: header.id } : {}),
    name: header.name,
    prefix: header.prefix,
    ...(header.value === UNCHANGED_SECRET ? {} : { value: header.value })
  }));

const buildSubstitutions = (data: TServiceForm) =>
  data.substitutions.map((substitution) => ({
    ...(substitution.id ? { id: substitution.id } : {}),
    placeholder: substitution.placeholder,
    surfaces: substitution.surfaces,
    ...(substitution.value === UNCHANGED_SECRET ? {} : { value: substitution.value })
  }));

const buildHttpFields = (data: TServiceForm) => ({
  name: data.name,
  hostPattern: data.hosts.join(","),
  allowedMethods: isAllMethods(data.methods) ? null : data.methods,
  allowedPathPrefixes: data.pathPrefixes.length ? data.pathPrefixes : null,
  customHeaders: buildCustomHeaders(data),
  substitutions: buildSubstitutions(data)
});

const buildMcpConnection = (data: TServiceForm) => ({
  serverUrl: data.serverUrl.trim(),
  transport: data.transport,
  customHeaders: buildCustomHeaders(data)
});

const buildMcpFields = (data: TServiceForm) => ({
  name: data.name,
  ...buildMcpConnection(data),
  allowedTools: data.toolScope === McpToolScope.Selected ? data.allowedTools : null
});

export const buildCreateServiceRequest = (
  accessBundleId: string,
  data: TServiceForm
): TCreateAgentVaultServiceDTO => {
  const description = data.description.trim() || undefined;
  return data.serviceType === AgentVaultServiceType.Mcp
    ? {
        accessBundleId,
        type: AgentVaultServiceType.Mcp,
        ...buildMcpFields(data),
        description,
        credential: buildMcpCredential(data)
      }
    : {
        accessBundleId,
        type: AgentVaultServiceType.Http,
        ...buildHttpFields(data),
        description,
        credential: buildHttpCredential(data)
      };
};

export const buildUpdateServiceRequest = (
  accessBundleId: string,
  service: TAgentVaultService,
  data: TServiceForm
): TUpdateAgentVaultServiceDTO => {
  // Null rather than left out, so clearing the field removes the saved description.
  const description = data.description.trim() || null;
  return data.serviceType === AgentVaultServiceType.Mcp
    ? {
        accessBundleId,
        serviceId: service.id,
        type: AgentVaultServiceType.Mcp,
        ...buildMcpFields(data),
        description,
        ...withCredential(buildMcpCredentialPatch(data, service))
      }
    : {
        accessBundleId,
        serviceId: service.id,
        type: AgentVaultServiceType.Http,
        ...buildHttpFields(data),
        description,
        credential: buildHttpCredentialPatch(data)
      };
};

/** The admin's own token or sign-in, used once to list the tools of a service whose members each provide theirs. */
export type TMcpToolsOwnCredential = { token: string } | { authorizationId: string };

// Sent as a credential the admin sets in full, which only the list call ever sees.
const ownToolsCredential = (
  data: TServiceForm,
  own: TMcpToolsOwnCredential
): TAgentVaultCredentialUpdate =>
  "authorizationId" in own
    ? { type: AgentVaultCredentialType.OAuth, authorizationId: own.authorizationId }
    : {
        ...bearerCredential(data),
        headerName: data.headerName || "Authorization",
        value: own.token,
        memberProvidedFields: []
      };

// The credential and headers go as an update sends them, so on edit a value left untouched falls back to
// the saved service's.
export const buildListMcpToolsRequest = (
  accessBundleId: string,
  serviceId: string | undefined,
  data: TServiceForm,
  own?: TMcpToolsOwnCredential
): TListAgentVaultMcpToolsDTO => ({
  accessBundleId,
  ...(serviceId ? { serviceId } : {}),
  ...buildMcpConnection(data),
  ...withCredential(own ? ownToolsCredential(data, own) : buildMcpCredentialPatch(data, null))
});

const typedValuesNoun = (
  fields: TAgentVaultMemberProvidedField[],
  type: AgentVaultCredentialType
) => {
  const hasUsername = fields.includes(AgentVaultVariableReferenceField.CredentialUsername);
  const hasSecret = fields.includes(AgentVaultVariableReferenceField.CredentialValue);
  if (type !== AgentVaultCredentialType.Basic) return "token";
  if (hasUsername && hasSecret) return "username and password";
  return hasUsername ? "username" : "password";
};

const nextCredentialTail = (data: TServiceForm) => {
  const nextFields = data.memberProvidedFields;
  if (data.credentialType === AgentVaultCredentialType.OAuth) {
    return isCredentialMemberProvided(data)
      ? ". Each member has to connect their own account."
      : ", and sessions will use your account.";
  }
  if (data.credentialType === AgentVaultCredentialType.Passthrough) {
    return ", and the proxy will add no credential.";
  }
  if (nextFields.length) {
    return `. Each member has to set their own ${typedValuesNoun(nextFields, data.credentialType)}.`;
  }
  return ", and sessions will use the credential you set.";
};

export type TMembersClearedNotice = { title: string; description: string };

/**
 * What a save deletes that members (or the admin's own OAuth sign-in) depend on, so the admin is asked first. The
 * server applies the same rules whatever the client sends; this only names them before the save.
 */
export const membersClearedNotice = (
  data: TServiceForm,
  service?: TAgentVaultService | null
): TMembersClearedNotice | null => {
  if (!service) return null;
  const storedType = service.credential.type;
  const storedFields = storedMemberFields(service);
  const isMcp = data.serviceType === AgentVaultServiceType.Mcp;
  const typeChanged = storedType !== data.credentialType;
  const storedHost = service.serverUrl ? hostOf(service.serverUrl) : "";
  const wasMemberOAuth = isMemberProvidedOAuthService(service);

  if (wasMemberOAuth) {
    const connectionsRemoved = "Remove Members' Connections?";
    if (typeChanged) {
      return {
        title: connectionsRemoved,
        description: `Every member's connection to ${storedHost} will be removed${nextCredentialTail(data)}`
      };
    }
    if (!isCredentialMemberProvided(data)) {
      return {
        title: connectionsRemoved,
        description: `Every member's connection to ${storedHost} will be removed, and sessions will use your account.`
      };
    }
    const isServerChanged = isMcp && data.serverUrl.trim() !== service.serverUrl;
    if (isServerChanged || isMemberOAuthClientChanged(data, service)) {
      return {
        title: connectionsRemoved,
        description: "Every member's connection will be removed. Each member has to connect again."
      };
    }
    return null;
  }

  if (
    storedType === AgentVaultCredentialType.OAuth &&
    data.credentialType === AgentVaultCredentialType.OAuth &&
    isCredentialMemberProvided(data)
  ) {
    return {
      title: "Remove Your Connection?",
      description: `Your connection to ${storedHost} will be removed. Sessions can't use this service until each member connects their own account.`
    };
  }

  if (!storedFields.length) return null;
  if (typeChanged) {
    const noun = typedValuesNoun(storedFields, storedType);
    return {
      title: "Remove Members' Values?",
      description: `Every member's ${noun} for this service will be removed${nextCredentialTail(data)}`
    };
  }
  const takenBack = storedFields.filter((field) => !data.memberProvidedFields.includes(field));
  if (!takenBack.length) return null;
  const noun = typedValuesNoun(takenBack, storedType);
  return {
    title: "Remove Members' Values?",
    description: `Every member's ${noun} for this service will be removed, and sessions will use the ${noun} you set.`
  };
};
