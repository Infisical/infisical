# Dynamic-secret provider form architecture

Dynamic-secret provider create and edit forms share one typed shell. Provider definitions retain their own validation, defaults, field interaction, hydration, and request adapters so the shared UI does not flatten provider behavior.

## Ownership boundaries

| Boundary | Owns | Does not own |
| --- | --- | --- |
| Shared form shell | Secret name, TTL presentation, environment selection, responsive layout, submit/cancel behavior, pending-state duplicate prevention, mutation wiring, edit success feedback, and first-invalid-field focus | Provider queries, conditional interaction, or DTO semantics |
| Provider registry | `provider → definition` lookup, picker order, docs slug overrides | Icons (create picker) or provider-specific UI |
| Provider definition | Provider identity, mode-specific scalar fields, custom-renderer reasons, and common-field presentation | Cross-provider mutation state or a second form |
| Shared field blocks | Reusable SSL, statement accordion, and username-template controls used by multiple definitions | Provider DTO adapters |
| Create/edit contract | Zod schema, defaults or edit hydration, and typed DTO adapter | Rendering or mutation hooks |
| Scalar renderer | V3 text, secret, number, textarea, select, and switch controls | Repeaters, remote data, imports, gateways, or nested values |
| Custom renderer | Only interaction covered by an escape-hatch reason; it reads and writes shared React Hook Form state | Submitting, duplicating common fields, or bypassing schemas and adapters |

Create and edit routers mount one `DynamicSecretProviderForm` from the registry. SSH create is the only special-case wrapper (`sshCreateForm.tsx`) because of its post-create certificate setup disclosure.

Create and edit intentionally use separate value types. This preserves edit-only optional secrets, nullable gateway identifiers, rename behavior, multi-create providers, fixed TTLs, and `undefined` versus `null` API semantics.

## Shared behavior

- Standard TTL validation retains the existing one-minute minimum, ten-year maximum, timing, and user-facing messages. Providers with different limits keep mode-specific schemas.
- Create owns environment selection. Single-environment mode hydrates the first environment; multi-environment mode requires an explicit choice. Edit uses the route environment and renders no selector.
- The default `{{randomUsername}}` template is omitted on create and sent as `null` on edit unless a provider contract deliberately differs.
- Edit hydration passes secret values through unchanged. Secret controls never inspect, log, unmask, or replace masked values.
- The shell owns mutation loading state and prevents duplicate submission. A remote custom renderer can additionally block or mark submit pending.
- A create adapter can return one payload or a list of payloads. The shell awaits every request before completing.
- Create completion receives the mutation result. SSH uses that seam for its certificate setup step without moving mutation ownership into the renderer.
- Errors remain associated with controls, keyboard order follows the document, React Hook Form focuses the first invalid field, and common/action layouts collapse on narrow viewports.

## Custom-renderer criteria

A definition must name at least one objective reason when it uses a custom renderer:

- `conditional-fields`: another field changes a control's presence or meaning.
- `repeatable-fields`: the user manages a nested collection.
- `permission-aware-fields`: a control reflects a permission-disabled state.
- `remote-options`: options come from a query or search.
- `import-workflow`: another workflow hydrates multiple values.
- `non-scalar-value`: scalar metadata cannot represent the value or interaction.
- `multi-create`: one submission intentionally creates multiple dynamic secrets.
- `post-create-workflow`: completion requires a result-dependent follow-up step.
- `context-aware-fields`: project, route, or organization context changes field behavior.

The reason describes behavior, not styling. A custom renderer still uses the shared form context, V3 primitives, accessible labels and errors, and the mode contract.

## Provider coverage and retained exceptions

All 27 provider create/edit pairs delegate to this architecture:

| Group | Providers |
| --- | --- |
| Identity and access | AWS IAM, GCP IAM, Azure Entra ID, GitHub, Tailscale, SSH, LDAP |
| Managed cache and document stores | AWS ElastiCache, AWS MemoryDB, Redis, MongoDB, MongoDB Atlas, Couchbase |
| Relational and warehouse | SQL Database, Azure SQL Database, ClickHouse, Snowflake, Vertica, SAP ASE, SAP HANA |
| Data services and protocols | Cassandra, Elasticsearch, Kubernetes, Milvus, RabbitMQ, IBM API Connect, TOTP |

The notable provider-specific exceptions remain explicit:

- Azure Entra ID loads users from credentials and creates one secret per selected user.
- GitHub displays its fixed one-hour TTL and omits max TTL; TOTP keeps its fixed hidden TTL contract.
- SSH retains the post-create and edit certificate setup/disclosure workflows.
- SQL, Cassandra, LDAP, and Kubernetes retain their create-only Vault import workflows.
- Gateway providers preserve attach permission behavior and create `undefined` versus edit `null` clearing semantics.
- AWS IAM, LDAP, Elasticsearch, Tailscale, and TOTP sanitize inactive discriminated-union branches in adapters.
- MongoDB, RabbitMQ, GCP IAM, Milvus, Couchbase, and MongoDB Atlas retain their repeatable or nested value adapters.
- Metadata and generated-password requirements remain provider-owned where the current product exposes them.

## Adding or changing a provider

Treat a provider change as a reviewable batch even though the initial migration is complete:

1. Record the existing create request and edit request, including absent, empty, `null`, and unchanged values.
2. Preserve create defaults and edit hydration, especially masked secrets and server-omitted inputs.
3. Test every discriminator, nested list, gateway, import, query, metadata, and permission-disabled state.
4. Preserve validation paths, timing, and messages unless Product/UX explicitly approves a change.
5. Verify TTL, environment, username-template, pending, success, and recoverable error behavior.
6. Verify keyboard order, error focus, narrow layout, and accessible names and descriptions.
7. Confirm provider picker and router reachability without changing unrelated provider types.

Support scripts may inventory pairs, generate thin wrappers, add registry exports, or translate a manually classified scalar allowlist. They must fail on conditional branches, field arrays, queries, permissions, imports, statements, or unknown DTO transforms. Automation must never infer schemas, masking, defaults, nullability, custom-renderer reasons, or migrate an unreviewed provider.

## Audit mapping

| Audit ID | Coverage |
| --- | --- |
| B2-01 | One typed shell and mode-specific definition contract replace duplicated provider create/edit form ownership. |
| B2-07 | Import workflows are explicit typed escape hatches; provider adapters retain their mapping semantics. |
| B4-02 | Provider renderers and callouts use V3 primitives while retaining conditional behavior. |
| B4-03 | The shell owns the common configuration heading, responsive field layout, and action row. |

## Verification

Pure contract tests live beside the architecture and cover shared behavior plus provider defaults, validation, hydration, masking, and exact create/edit adapters. Run them from `frontend/`:

```sh
TSX_TSCONFIG_PATH=tsconfig.app.json ./node_modules/.bin/tsx --test src/components/dynamic-secrets/DynamicSecretProviderForm/*.test.ts
```

Contract tests do not replace browser evidence. Manual coverage still includes create and edit at desktop and narrow widths, keyboard/error focus, permission-disabled gateways, every conditional branch, loading and duplicate-submit behavior, masked secrets, and success/error states where approved credentials and infrastructure are available.

The ENG-5456 baselines cover the 1024×768 admin provider picker and SQL create form only. They do not prove submitted credentials, edit hydration, lease creation, or provider success/error states. After evidence must retain each basename and match role, route, state, and viewport; report unavailable states honestly.
