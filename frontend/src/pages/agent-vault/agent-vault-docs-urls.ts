const AGENT_VAULT_DOCS_BASE_URL = "https://infisical.com/docs/documentation/platform/agent-vault";

export const AgentVaultDocsUrls = {
  overview: `${AGENT_VAULT_DOCS_BASE_URL}/overview`,
  quickstart: `${AGENT_VAULT_DOCS_BASE_URL}/quickstart`,
  accessBundles: `${AGENT_VAULT_DOCS_BASE_URL}/access-bundles`,
  services: `${AGENT_VAULT_DOCS_BASE_URL}/services`,
  memberProvidedValues: `${AGENT_VAULT_DOCS_BASE_URL}/http-apis#member-provided-values`,
  mcpMemberProvidedCredential: `${AGENT_VAULT_DOCS_BASE_URL}/mcp-servers#leave-the-credential-to-each-member`,
  variables: `${AGENT_VAULT_DOCS_BASE_URL}/variables`,
  skills: `${AGENT_VAULT_DOCS_BASE_URL}/skills`,
  sessions: `${AGENT_VAULT_DOCS_BASE_URL}/sessions`,
  sessionsOnBehalfOfUsers: `${AGENT_VAULT_DOCS_BASE_URL}/sessions-on-behalf-of-users`,
  proxies: `${AGENT_VAULT_DOCS_BASE_URL}/proxies`,
  modalGuide: `${AGENT_VAULT_DOCS_BASE_URL}/guides/modal`,
  daytonaGuide: `${AGENT_VAULT_DOCS_BASE_URL}/guides/daytona`,
  e2bGuide: `${AGENT_VAULT_DOCS_BASE_URL}/guides/e2b`,
  dockerGuide: `${AGENT_VAULT_DOCS_BASE_URL}/guides/docker`,
  kubernetesSetupGuide: `${AGENT_VAULT_DOCS_BASE_URL}/guides/kubernetes-setup`,
  cursorGuide: `${AGENT_VAULT_DOCS_BASE_URL}/guides/cursor`,
  sessionLogs: `${AGENT_VAULT_DOCS_BASE_URL}/session-logs`
} as const;
