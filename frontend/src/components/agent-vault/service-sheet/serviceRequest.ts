import {
  AgentVaultCredentialType,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultCredentialInput,
  TAgentVaultCredentialUpdate,
  TCreateAgentVaultServiceDTO,
  TUpdateAgentVaultServiceDTO
} from "@app/hooks/api/agentVault/types";

import {
  isAllMethods,
  newOAuthAuthorizationId,
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

// A member-provided field is sent without a value: each member sets their own.
const buildHttpCredential = (data: TServiceForm): TAgentVaultCredentialInput => {
  const { bearer, basic, isMemberProvided } = memberFieldsOf(data);
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
  return {
    ...bearerCredential(data),
    value: bearer.length ? undefined : (data.secret ?? ""),
    memberProvidedFields: bearer
  };
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

const buildMcpCredential = (data: TServiceForm) =>
  data.credentialType === AgentVaultCredentialType.OAuth
    ? {
        type: AgentVaultCredentialType.OAuth as const,
        authorizationId: newOAuthAuthorizationId(data) ?? ""
      }
    : bearerCredential(data);

// An OAuth credential has nothing to change without a new authorization made for the current URL, so
// it is left out and the stored tokens stay.
const buildMcpCredentialPatch = (data: TServiceForm): TAgentVaultCredentialUpdate | undefined => {
  if (data.credentialType !== AgentVaultCredentialType.OAuth) return buildHttpCredentialPatch(data);
  const authorizationId = newOAuthAuthorizationId(data);
  return authorizationId ? { type: AgentVaultCredentialType.OAuth, authorizationId } : undefined;
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

const buildMcpFields = (data: TServiceForm) => ({
  name: data.name,
  serverUrl: data.serverUrl.trim(),
  transport: data.transport,
  customHeaders: buildCustomHeaders(data)
});

export const buildCreateServiceRequest = (
  accessBundleId: string,
  data: TServiceForm
): TCreateAgentVaultServiceDTO =>
  data.serviceType === AgentVaultServiceType.Mcp
    ? {
        accessBundleId,
        type: AgentVaultServiceType.Mcp,
        ...buildMcpFields(data),
        credential: buildMcpCredential(data)
      }
    : {
        accessBundleId,
        type: AgentVaultServiceType.Http,
        ...buildHttpFields(data),
        credential: buildHttpCredential(data)
      };

export const buildUpdateServiceRequest = (
  accessBundleId: string,
  serviceId: string,
  data: TServiceForm
): TUpdateAgentVaultServiceDTO =>
  data.serviceType === AgentVaultServiceType.Mcp
    ? {
        accessBundleId,
        serviceId,
        type: AgentVaultServiceType.Mcp,
        ...buildMcpFields(data),
        ...withCredential(buildMcpCredentialPatch(data))
      }
    : {
        accessBundleId,
        serviceId,
        type: AgentVaultServiceType.Http,
        ...buildHttpFields(data),
        credential: buildHttpCredentialPatch(data)
      };
