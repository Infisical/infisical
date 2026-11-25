# Gateway offline alerts

How `healthcheckNotify` (`gateway-v2-service.ts`) raises the `networking.gateway.offline` event and the in-app bell.
The provider lives in `src/services/alert/providers/gateway-alert-provider.ts`; the event contract in
`gateway-v2-events.ts`.

## When a gateway is due

`buildOfflineAlertDueSql` (`gateway-v2-dal.ts`) is the only definition. A gateway is due when it was probed at least
once, is not reachable (`buildGatewayReachableSql`), and `healthAlertedAt` is null or both older than its last
successful probe (`buildGatewayLastSeenSql`, the later of `heartbeat` and `directHeartbeat`) and over an hour old. So a
down gateway alerts once per outage and at most once an hour. Only a successful probe moves either heartbeat forward,
which is what makes "alerted before the last probe" mean "recovered since".

It also waits until the last successful probe is older than `OFFLINE_ALERT_MIN_SILENCE_SECONDS` (two missed
check-ins), because one failed check-in already marks a gateway unreachable and would otherwise page on a single
glitch. Leave `buildGatewayReachableSql` alone for this: pools and routing use it.

`healthAlertedAt` is stamped with the app's clock, like the heartbeats it is compared with.

## The claim

The cron reads candidates from the replica (`findOfflineDueForAlert`), then claims them in batches of
`GATEWAY_OFFLINE_BATCH_SIZE`, each in its own short transaction: `markOfflineAlerted` re-checks the due rule on the
primary, stamps `healthAlertedAt` and sets a local `statement_timeout`, and the batch's event is emitted in the same
transaction. Re-checking on the primary is what stops an overlapping run or a lagging replica from alerting twice.
Never emit `networking.gateway.offline` outside this claim: event alerts are not deduped.

The batch size is PagerDuty's per-run cap (`PAGERDUTY_MAX_INCIDENTS_PER_RUN`) because the alert engine drops event
targets past a channel's cap instead of deferring them, and a claimed gateway is not alerted again this outage.

The in-app bell goes to org admins after the claims commit, for every gateway claimed in that org. It is best-effort,
like the honey token bell: a failed send is logged, not retried.

## Reconnects

A gateway agent's connect rewrites its transports through `$writeAgentTransports`, which clears the heartbeat of a
transport that was dropped or changed. That can move the last-seen time back before the last alert and hide the next
outage, so `rearmsOfflineAlert` resets `healthAlertedAt`, but only when a cleared heartbeat is newer than the alert
(the gateway recovered since). A restart that clears an older heartbeat, such as a new pod IP mid-outage, keeps the
stamp and the hourly floor. Enrollment (`$bumpTokenVersion`) clears both heartbeats, which makes the gateway count as
never probed until its next successful probe, so it needs no reset.
