import {
  displayHostPattern,
  HTTP_METHODS,
  isNativeService,
  McpToolScope,
  storedMemberFields,
  type TServiceForm,
  UNCHANGED_SECRET
} from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  AGENT_VAULT_NATIVE_DEFAULT_PORTS,
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField,
  type TAgentVaultNativeServiceType
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultMemberProvidedField,
  TAgentVaultService
} from "@app/hooks/api/agentVault/types";

export const BLANK_SERVICE_FORM: TServiceForm = {
  serviceType: AgentVaultServiceType.Http,
  name: "",
  description: "",
  serverUrl: "",
  transport: AgentVaultMcpTransport.StreamableHttp,
  hosts: [],
  host: "",
  port: "",
  database: "",
  tlsEnabled: true,
  tlsVerify: true,
  tlsCa: "",
  sshPrivateKey: "",
  sshCertificate: "",
  sshCertificateRemoved: false,
  hostDraft: "",
  pathDraft: "",
  toolScope: McpToolScope.All,
  allowedTools: [],
  credentialType: AgentVaultCredentialType.Bearer,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  username: "",
  secret: "",
  oauthAuthorizationId: "",
  oauthAuthorizedUrl: "",
  oauthScopes: [],
  oauthAuthorizationRejection: "",
  oauthClientId: "",
  oauthClientSecret: "",
  oauthAutomaticSetup: false,
  memberProvidedFields: [],
  methods: [...HTTP_METHODS],
  pathPrefixes: [],
  customHeaders: [],
  substitutions: [],
  hookEnabled: false,
  hookUrl: "",
  hookSigningSecret: ""
};

export const blankFormOf = (serviceType: AgentVaultServiceType): TServiceForm => {
  if (serviceType === AgentVaultServiceType.Http) return BLANK_SERVICE_FORM;
  if (serviceType === AgentVaultServiceType.Mcp)
    return {
      ...BLANK_SERVICE_FORM,
      serviceType,
      credentialType: AgentVaultCredentialType.Bearer
    };
  return {
    ...BLANK_SERVICE_FORM,
    serviceType,
    port: String(AGENT_VAULT_NATIVE_DEFAULT_PORTS[serviceType as TAgentVaultNativeServiceType]),
    credentialType: AgentVaultCredentialType.Basic
  };
};

const hookFieldsOf = (service: TAgentVaultService) => ({
  hookEnabled: Boolean(service.hook),
  hookUrl: service.hook?.url ?? "",
  hookSigningSecret: service.hook ? UNCHANGED_SECRET : ""
});

export const formFromService = (service: TAgentVaultService): TServiceForm => {
  const memberProvidedFields = storedMemberFields(service);
  const storedValue = (field: TAgentVaultMemberProvidedField) =>
    memberProvidedFields.includes(field) ? "" : UNCHANGED_SECRET;

  if (isNativeService(service)) {
    const { credential } = service;
    const databaseService = service.type === AgentVaultServiceType.Ssh ? null : service;
    const isSshKey = credential.type === AgentVaultCredentialType.SshKey;
    return {
      ...blankFormOf(service.type),
      name: service.name,
      description: service.description ?? "",
      host: service.host,
      port: String(service.port),
      database: databaseService?.database ?? "",
      tlsEnabled: databaseService?.tls.enabled ?? true,
      tlsVerify: databaseService?.tls.verify ?? true,
      tlsCa: databaseService?.tls.ca ?? "",
      credentialType: credential.type,
      username:
        credential.type === AgentVaultCredentialType.Basic
          ? storedValue(AgentVaultVariableReferenceField.CredentialUsername)
          : UNCHANGED_SECRET,
      secret:
        credential.type === AgentVaultCredentialType.Basic
          ? storedValue(AgentVaultVariableReferenceField.CredentialValue)
          : "",
      memberProvidedFields,
      sshPrivateKey: isSshKey ? UNCHANGED_SECRET : "",
      sshCertificate: isSshKey && credential.hasCertificate ? UNCHANGED_SECRET : "",
      ...hookFieldsOf(service)
    };
  }

  if (service.type === AgentVaultServiceType.Mcp) {
    const { credential } = service;
    const isBearer = credential.type === AgentVaultCredentialType.Bearer;
    return {
      ...blankFormOf(AgentVaultServiceType.Mcp),
      name: service.name,
      description: service.description ?? "",
      serverUrl: service.serverUrl,
      transport: service.transport,
      toolScope: service.allowedTools ? McpToolScope.Selected : McpToolScope.All,
      allowedTools: service.allowedTools ?? [],
      credentialType: isBearer ? AgentVaultCredentialType.Bearer : AgentVaultCredentialType.OAuth,
      headerName: isBearer ? credential.headerName : "Authorization",
      headerPrefix: isBearer ? credential.headerPrefix : "Bearer",
      secret: isBearer && !memberProvidedFields.length ? UNCHANGED_SECRET : "",
      memberProvidedFields,
      oauthClientId:
        credential.type === AgentVaultCredentialType.OAuth ? (credential.clientId ?? "") : "",
      customHeaders: service.customHeaders.map((header) => ({
        id: header.id,
        name: header.name,
        prefix: header.prefix,
        value: UNCHANGED_SECRET
      })),
      ...hookFieldsOf(service)
    };
  }

  const { credential } = service;
  return {
    ...BLANK_SERVICE_FORM,
    name: service.name,
    description: service.description ?? "",
    hosts: displayHostPattern(service.hostPattern).split(", "),
    credentialType: credential.type,
    headerName:
      credential.type === AgentVaultCredentialType.Bearer ? credential.headerName : "Authorization",
    headerPrefix:
      credential.type === AgentVaultCredentialType.Bearer ? credential.headerPrefix : "Bearer",
    username:
      credential.type === AgentVaultCredentialType.Basic
        ? storedValue(AgentVaultVariableReferenceField.CredentialUsername)
        : undefined,
    secret:
      credential.type === AgentVaultCredentialType.Passthrough
        ? ""
        : storedValue(AgentVaultVariableReferenceField.CredentialValue),
    memberProvidedFields,
    methods: service.allowedMethods ?? [...HTTP_METHODS],
    pathPrefixes: service.allowedPathPrefixes ?? [],
    customHeaders: service.customHeaders.map((header) => ({
      id: header.id,
      name: header.name,
      prefix: header.prefix,
      value: UNCHANGED_SECRET
    })),
    substitutions: service.substitutions.map((substitution) => ({
      id: substitution.id,
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces,
      value: UNCHANGED_SECRET
    })),
    ...hookFieldsOf(service)
  };
};

export const editUnavailableReason = (service: TAgentVaultService) =>
  service.credential.type === AgentVaultCredentialType.OAuth
    ? "Editing an OAuth service isn't available in v4 yet"
    : undefined;
