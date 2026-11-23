# Agent Vault domain

Holds Agent Vault billing: the free monthly tier, who may broker credentials, and turning proxy usage reports into
metering events. The rules and services are in `ee/`; `ce/` holds only the types other code imports. Built after
License in `domains.ts`. The rest of Agent Vault still lives in `src/ee/services/agent-vault-*` (read
`src/ee/services/agent-vault/AGENTS.md`).

- **Access** (`AgentVaultAccess.decide`, cloud only): an org whose root org plan says `agentVault: false` brokers
  for free up to `AGENT_VAULT_FREE_MONTHLY_REQUESTS` a calendar month (UTC), then is refused with a
  `RuleViolationError` named `AgentVaultFreeLimitReached` until the month resets or it adds a payment method. A
  plan that grants it (`true`) or says nothing (`null`: the License Server switch doesn't exist yet, or a fallback
  plan during an outage) is never limited, so a missing switch never blocks anyone. Self-hosted is never counted or
  limited.
- **Infisical counts the free tier itself**, because the License Server knows nothing about orgs without a license.
  The count is in the key store (`FreeUsageCache`), per root org and month, so sub-orgs share their root's. A read
  that fails allows: an outage never blocks brokering. The count is in Redis only: losing it gives orgs extra free
  requests, never blocks them.
- **Only brokering is gated.** The proxy's per-poll `resolveSession` and `refreshCredential`
  (`agent-vault-proxy-service.ts`) call `agentVaultAccessService.assertCanBroker` after the session check, so a
  refusal says nothing about a token that isn't the caller's. Minting sessions, creating proxies, rotating tokens,
  bootstrap and heartbeat stay open so the proxy keeps running and resumes by itself. Everything else, reads,
  deletes and revokes included, never checks the plan. This is the one written exception to the license rule in
  `backend/CODE_QUALITY.md`.
- **Notices**: while a free-tier root org's count is past `WARN_AT_SHARE_OF_LIMIT` (75%) or the limit and that
  month's notice wasn't delivered, `recordProxyUsage` returns it under a short lock (`lockNotice`), on any report,
  not only the one that crossed, so a notice missed during a trial, an outage or a failed send still goes out. The
  usage route hands it to `agentVaultFreeUsageNoticeService` (`src/ee/services/agent-vault-free-usage-notice/`),
  which emails the root org's admins and sends the PostHog events, because a domain can't take the SMTP or
  telemetry service; it must call `completeNotice` after delivery or `releaseNotice` on failure. Never send a notice
  from anywhere else, or it goes out twice.
- **Two entry points.** `assertCanBroker` is `getAccess(orgId)` followed by `assertAllowed()`, and reads the count
  only when the plan says no. `getAccess` is for the UI and only reads.
- **Usage**: count every cloud brokered request, whatever the plan, then report it (`recordMeteringEvents`, meter
  `agent_vault_brokered_requests`, `org-tree`). A report's month is when Infisical received it, never the proxy's
  `endedAt`. Each `reportId` is claimed for ten minutes, so a report sent twice in that window is counted and
  metered once. A resend after it is counted again for the free tier (the License Server still bills it once). Never
  check here whether the plan prices it; the License Server refuses or stores unbilled what it doesn't price. The
  proxy's `reportId` and `endedAt` are the event's dedupe key, so never generate them here. Billing never reads
  `agent_vault_session_stats`, which is a display number.
