# Workflow Integrations domain

An org's Slack and Microsoft Teams app installs, and posting to their channels. Owns `workflow_integrations`,
`slack_integrations` and `microsoft_teams_integrations` (`WorkflowIntegrationStore`, one model across the three tables,
which share the id). Depends on Organizations (org Settings permission), KMS Core (the org data key that encrypts bot
tokens) and Instance Config Core (the instance's Slack and Teams app credentials).

**It knows how to install and how to post. Products decide when, where and what.** A product keeps its own "post this
event to these channels" settings keyed by an integration id (Secret Manager's project chat config, PAM's folder
notification configs, Alerting's `slack-app` channel), renders the message, and calls
`chatDeliveryService.post({ orgId, integrationId, message: ChatMessage.slack(...) | ChatMessage.microsoftTeams(...),
channelIds, teamId?, limits? })`. Never add product vocabulary (event names, wording, URLs into a product) here.

| Piece | Holds |
| --- | --- |
| `models/workflow-integration.ts` | `WorkflowIntegration`: slug, description, status, and the provider's install (`SlackInstallation` or `MicrosoftTeamsInstallation`). A Slack install starts installed, a Teams one pending until the bot is in the tenant |
| `models/microsoft-teams-installation.ts` | Tenant, catalog app id and the cached Graph and Bot Framework tokens; `cachedToken(kind, now)` refuses a token with five minutes or less left |
| `models/chat-message.ts` | `ChatMessage`, a message already rendered for one provider |
| `clients/slack/`, `clients/microsoft-teams/` | The Slack SDKs, Entra/Graph/Bot Framework calls and the Teams bot (`MicrosoftTeamsBot`, the `CloudAdapter`, process state). They map provider errors into `ChatPostFailure` |
| `services/workflow-integration/` | `listByOrg` for the org's list route; `findInOrg` / `listInOrg` for products checking an id they store |
| `services/slack-integration/`, `services/microsoft-teams-integration/` | Install flows and the integration routes |
| `services/chat-delivery/` | `post` |
| `router/` | `/api/v1/workflow-integrations`, `/slack/*` and `/microsoft-teams/*`, taking its services as `TWorkflowIntegrationsRouterDeps` |

## Rules

- **Posting never throws for a channel.** `post` tries every channel in order and returns each one's outcome
  (`delivered`, or a `ChatPostFailure` with the provider's own code in `providerError`), or `{ integrationMissing: true }`
  when the id is not an integration of the org. A message for the other provider is a `RuleViolationError`. Callers that
  cannot wait (alert dispatch) pass `limits`, which also turns a rate limit into an immediate `RateLimited`.
- **Another org's integration reads as missing** in `findInOrg`, `listInOrg` and `post`. The integration routes look an
  id up across orgs and then check Settings permission in the integration's org, so another org's id gets the
  org-permission 403, as it always has.
- **No call to Slack or Microsoft inside a transaction.** A Teams token refresh issues the token first, then saves it in
  its own short transaction on the row as it is then (`microsoftTeamsToken` in `services/helpers/`), so it never
  reverts a rename or status change made meanwhile. Every write reads the row with `findByIdForUpdate` inside `run`.
- **The Teams bot is per process.** `WorkflowIntegrationsModule.start()` builds it from the instance credentials;
  `startBackgroundSync()` (production only) rebuilds it when another pod saved new credentials, and Instance Admin calls
  `microsoftTeamsIntegrationService.reinitializeBot` after saving them on this pod. The bot joining a team marks the
  tenant's pending integration installed.
- **Config comes in through the module**: `siteUrl`, `isCloud` and `authSecret` (the Slack OAuth state secret) from
  `domains.ts`. Nothing here calls `getConfig()`.
- **The routes take their services as deps** (`registerWorkflowIntegrationsRouter(server, deps)`), never from
  `server.services`. The audit log is the one exception until Audit Log Core lands.
- **`GET /slack/:id/alert-count` belongs to Alerting** (`server/routes/v1/alert-slack-integration-router.ts`), mounted
  under the same prefix: the count is Alerting's data, and it asks this domain only for the read check
  (`slackIntegrationService.assertCanRead`).

## Declared exceptions

- Foreign keys from other features' tables onto these tables stay: `project_slack_configs` and
  `project_microsoft_teams_configs` (Secret Manager) and `pam_folder_notification_configs` (PAM) cascade on delete,
  `alert_channels.workflowIntegrationId` is set null, and `workflow_integrations.orgId` cascades from `organizations`.
  Deleting an integration therefore removes those rows in its own transaction.

## Tests

`testing/build-workflow-integrations.ts` builds the real module over in-memory stores with `FakeSlackClient`,
`FakeMicrosoftTeamsClient`, `FakeMicrosoftTeamsBot`, `FakeKmsCore`, `FakeInstanceConfigService` and real org
permissions. `testing/workflow-integration-store-contract.ts` runs against both stores. Consumers use
`FakeChatDeliveryService` and `FakeWorkflowIntegrationService`.
