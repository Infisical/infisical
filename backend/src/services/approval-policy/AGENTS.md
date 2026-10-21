# Approvals

Paths are relative to `backend/`. Read [`backend/AGENTS.md`](../../../AGENTS.md) and [`backend/CODE_QUALITY.md`](../../../CODE_QUALITY.md) first.

## Approvals

All "someone has to approve this before it happens" features share one module:
`src/services/approval-policy/`, which owns policies, requests, steps, grants, break-glass, and
the generic `/v1/<policy-type>/approval-policies` endpoints. Current types: PAM access, certificate
requests, code signing.

A policy type plugs in through **one** extension point, a `TApprovalResource` (see its doc comment),
constructed with its own dependencies and registered in the `approvalResources` map in
`server/routes/index.ts`; that also gives it the generic `/v1/approval-policies/<type>/...` endpoints,
which every type now uses for policy CRUD, requests, approve, reject and grant revocation. **Do not stand up a per-product approval service, request table, or review
endpoint**: `access-approval-*` and `secret-approval-*` predate this module and are what we are
converging away from. A product-facing service on top of it (PAM's `pam-access-request-service.ts`) is
for product vocabulary only: resolving the resource a request names, notifications, and read models.
Any rule about what is *allowed* belongs in the resource, or the product's own API and the shared API
stop agreeing.
