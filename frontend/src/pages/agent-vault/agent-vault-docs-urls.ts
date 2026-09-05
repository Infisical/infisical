/**
 * Centralized Agent Vault documentation URLs.
 */

const AGENT_VAULT_DOCS_BASE_URL = "https://infisical.com/docs/documentation/platform/agent-vault";

export const AgentVaultDocsUrls = {
  overview: `${AGENT_VAULT_DOCS_BASE_URL}/overview`,
  quickstart: `${AGENT_VAULT_DOCS_BASE_URL}/quickstart`,
  accessBundles: `${AGENT_VAULT_DOCS_BASE_URL}/access-bundles`,
  sessions: `${AGENT_VAULT_DOCS_BASE_URL}/sessions`,
  proxies: `${AGENT_VAULT_DOCS_BASE_URL}/proxies`
} as const;
