**Gateways: there is only one generation.** Gateway v1 (`ee/services/gateway`, `lib/gateway`, the QUIC
transport over `@infisical/quic`, and `/api/v1/gateways`) is gone; `gateway-v2` and `gateway-pool` are the
whole story, and `lib/gateway-v2/types.ts` owns `GatewayProxyProtocol` / `GatewayHttpProxyActions`. What
survives is DB-only, and deliberately: the `gateways`, `org_gateway_config` and `project_gateways` tables
and the `gatewayId` columns on `dynamic_secrets`, `identity_kubernetes_auths` and
`identity_auth_templates` are still populated but never read or written, so the removal stays revertible.
Those three tables' `TableName` members exist for that reason alone.

Two consequences when touching a gateway dial path. Resolve the gateway with
`gatewayV2Service.getPlatformConnectionDetailsByGatewayId`, and when it returns nothing **throw**
(`getMissingGatewayMessage` in `lib/gateway-v2/gateway-errors.ts`) rather than continuing: every one of
these call sites sits in front of an `if (gatewayId)` guard whose else-branch dials the target host
directly, so falling through turns a dangling gateway reference into a silent bypass of the network
boundary the gateway exists to enforce. And `app_connections.gatewayId` is **not** a v1 column — unlike the
three above it never grew a `gatewayV2Id`, so that one column carries v2 ids and must stay.

**Any new path that attaches an individual gateway must call `assertIndividualGatewayAllowed`**
(`ee/services/gateway-pool/gateway-pool-policy-fns.ts`) next to its `AttachGateways` check. It enforces the
org-level `requireGatewayPools` setting. Pass the gateway the resource already had as `previousGatewayId`,
because clients re-send unchanged values on every save and resources created before the setting was turned
on must stay editable. The check reads the setting, not the plan, so it keeps applying after a downgrade.
Only exempt a mode that refuses pools outright, the way gateway Kubernetes auth in Gateway review mode does
(`$assertCanAttachProxy` in `resource-auth-method-service.ts`), or the policy removes that mode entirely.
