const AGENT_VAULT_DOCS_BASE_URL = "https://infisical.com/docs/documentation/platform/agent-vault";

export const AgentVaultDocsUrls = {
  overview: `${AGENT_VAULT_DOCS_BASE_URL}/overview`,
  quickstart: `${AGENT_VAULT_DOCS_BASE_URL}/quickstart`,
  accessBundles: `${AGENT_VAULT_DOCS_BASE_URL}/access-bundles`,
  services: `${AGENT_VAULT_DOCS_BASE_URL}/services`,
  memberProvidedValues: `${AGENT_VAULT_DOCS_BASE_URL}/http-apis#member-provided-values`,
  variables: `${AGENT_VAULT_DOCS_BASE_URL}/variables`,
  skills: `${AGENT_VAULT_DOCS_BASE_URL}/skills`,
  sessions: `${AGENT_VAULT_DOCS_BASE_URL}/sessions`,
  proxies: `${AGENT_VAULT_DOCS_BASE_URL}/proxies`,
  sessionLogs: `${AGENT_VAULT_DOCS_BASE_URL}/session-logs`
} as const;
