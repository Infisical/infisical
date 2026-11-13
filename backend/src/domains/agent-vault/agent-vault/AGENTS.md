# Agent Vault domain

Holds Agent Vault billing: who may broker credentials, grandfathering, and turning proxy usage reports into
metering events. EE-only, built after License in `domains.ts`. The rest of Agent Vault still lives in
`src/ee/services/agent-vault-*` (read `src/ee/services/agent-vault/AGENTS.md`).

- **Access** (`AgentVaultAccess.decide`, cloud only): allowed unless the root org's plan says `agentVault: false`
  and the org isn't grandfathered. A plan that says nothing (`null`: the License Server switch doesn't exist yet,
  or a fallback plan during an outage) allows, so a missing switch never blocks anyone. Self-hosted is never gated.
- **Two entry points, by cost.** `assertCanBroker` is for the proxy's per-poll calls (`resolveSession`,
  `refreshCredential`): it reads the grandfather table only when the plan says no, through a 5-minute cache, and
  never writes. `getAccess` is for people (the UI, `mintSession`, proxy create and rotate) and ends grandfathering.
- **Grandfathering** (`agent_vault_grandfathered_orgs`, root org ids): orgs that used Agent Vault before billing
  launched are never blocked and get an add-card modal. It ends the first time `getAccess` sees the plan grant
  Agent Vault (`plan.grants`, never on a fallback plan), so cancelling later blocks them like anyone else. The
  table is filled once, at launch, by a migration.
- **Usage**: report every cloud brokered request (`recordMeteringEvents`, meter `agent_vault_brokered_requests`,
  `org-tree`). Never check here whether the plan prices it; the License Server refuses or stores unbilled what it
  doesn't price. The proxy's `reportId` and `endedAt` are the event's dedupe key, so never generate them here.
  Billing never reads `agent_vault_session_stats`, which is a display number.
