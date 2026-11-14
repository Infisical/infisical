# Agent Vault domain

Holds Agent Vault billing: the free monthly tier, who may broker credentials, and turning proxy usage reports into
metering events. EE-only, built after License in `domains.ts`. The rest of Agent Vault still lives in
`src/ee/services/agent-vault-*` (read `src/ee/services/agent-vault/AGENTS.md`).

- **Access** (`AgentVaultAccess.decide`, cloud only): an org whose root org plan says `agentVault: false` brokers
  for free up to `AGENT_VAULT_FREE_MONTHLY_REQUESTS` a calendar month (UTC), then is refused with a
  `RuleViolationError` named `AgentVaultFreeLimitReached` until the month resets or it adds a card. A plan that
  grants it (`true`) or says nothing (`null`: the License Server switch doesn't exist yet, or a fallback plan during
  an outage) is never limited, so a missing switch never blocks anyone. Self-hosted is never counted or limited.
- **Infisical counts the free tier itself**, because the License Server knows nothing about orgs without a license.
  The count is in the key store (`FreeUsageCache`), per root org and month, so sub-orgs share their root's. A read
  that fails allows: an outage never blocks brokering.
- **Two entry points.** `assertCanBroker` is for the proxy's per-poll calls (`resolveSession`, `refreshCredential`):
  it reads the count only when the plan says no. `getAccess` is for the UI and also only reads. Nothing else gates.
- **Usage**: count every cloud brokered request, whatever the plan, then report it (`recordMeteringEvents`, meter
  `agent_vault_brokered_requests`, `org-tree`). A report's month is when Infisical received it, never the proxy's
  `endedAt`. Each `reportId` is claimed once for ten minutes; a resend inside that is ignored entirely, counted and
  metered once. Never check here whether the plan prices it; the License Server refuses or stores unbilled what it
  doesn't price. The proxy's `reportId` and `endedAt` are the event's dedupe key, so never generate them here.
  Billing never reads `agent_vault_session_stats`, which is a display number.
