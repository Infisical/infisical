# Dynamic-secret provider form contract

The shared contract keeps one create/edit form shell while leaving provider validation, defaults, hydration, and request adapters with each provider definition. The foundation is intentionally provider-neutral: legacy providers keep their existing forms until a rollout ticket registers a replacement.

## Ownership boundaries

| Boundary | Owns | Does not own |
| --- | --- | --- |
| Form shell | Name, TTL, environment, submit/cancel behavior, pending state, mutation wiring, and first-invalid-field focus | Provider queries, conditional behavior, or DTO semantics |
| Provider definition | Mode-specific schemas, defaults, scalar fields, custom-renderer reasons, and payload adapters | A second form or mutation ownership |
| Registry composition | Immutable definition lookup, picker order, documentation slugs, and duplicate rejection | Production provider definitions |
| Scalar renderer | V3 text, secret, number, textarea, select, and switch controls | Repeaters, remote options, imports, gateways, or nested editors |
| Custom renderer | Explicit non-scalar or context-aware interaction inside shared React Hook Form state | Submitting, bypassing schemas, or duplicating common fields |

Create and edit values are deliberately separate. That distinction preserves masked edit values, editable names, nullable gateway detachment, create-time omission, and provider-specific hydration without weakening types across modes.

## Registering a provider batch

Each rollout ticket owns a batch-local module. It imports the concrete definitions it migrated and exports only the shared registration contract:

```ts
export const identityAccessDynamicSecretProviders = defineDynamicSecretProviderModule({
  id: "identity-access",
  definitions: [awsIamDynamicSecretProvider, gcpIamDynamicSecretProvider]
});
```

The production composition root combines completed batches:

```ts
export const dynamicSecretProviderRegistry = createDynamicSecretProviderRegistry(
  identityAccessDynamicSecretProviders,
  managedStoresDynamicSecretProviders
);
```

`getDefinition(provider)` returns `undefined` for an unmigrated provider so routers can retain the existing legacy path during incremental rollout. `requireDefinition(provider)` is for code paths that already proved registration. Duplicate module IDs and duplicate providers fail during composition instead of silently overriding a definition.

## Field and renderer contract

- Scalar number controls convert the browser string to a finite number before React Hook Form and `z.number()` validation see it. Clearing a numeric field emits `undefined` rather than accidental zero.
- Secret controls preserve the supplied value and mask it with `type="password"`; edit defaults and adapters decide whether a masked value is sent unchanged.
- Multi-create adapters may return several payloads. The shell settles the full batch, closes after any partial success to prevent accidental duplicate retries, and reports the exact success count.
- Groups are sheet-agnostic. Panels use fieldset semantics, and collapsible groups use the shared V3 Accordion.
- A custom renderer must declare at least one objective reason such as `repeatable-fields`, `remote-options`, `permission-aware-fields`, or `non-scalar-value`.
- A custom renderer reads and writes the surrounding `FormProvider`; the shared shell still validates and submits the definition's adapter.

## Shared normalization

- `{{randomUsername}}` is omitted on create and sent as `null` on edit unless a provider deliberately overrides that behavior.
- A cleared gateway normalizes to `undefined` on create and `null` on edit.
- Standard TTL validation retains the existing one-minute minimum, ten-year maximum, and user-facing messages.
- Single-environment create defaults belong in the provider's `getDefaultValues`; multi-environment create keeps the environment field visible. Edit uses its route environment.

## Checkpoint provenance and departures

This foundation adapts the core contract from checkpoint commit `2eca032d7dc` without merging or cherry-picking the checkpoint.

| Checkpoint area | Disposition |
| --- | --- |
| `types.ts`, `schemas.ts`, scalar fields, form items, and shared controls | Adapted to current main |
| `DynamicSecretProviderForm.tsx` | Rewritten as a sheet-agnostic shell; dynamic-secret sheet, lease, renew, and post-create overlay work remain out of scope |
| `DynamicSecretProviderGroup.tsx` | Rewritten to compose the existing V3 Accordion rather than the checkpoint-only sheet section |
| `providerDefinitions/registry.ts` | Rewritten as immutable module composition so rollout batches do not edit core architecture |
| Number input handling | Rewritten to emit numbers before validation, resolving the unresolved PR #7529 finding |
| Production provider definitions and provider-family tests | Rejected from this foundation; owned by ENG-5513 through ENG-5516 |
| Route removal, Overview redesign, sheet/lease work, and unrelated primitive changes | Rejected as outside ENG-5518 |

## Verification

The reusable Node test harness lives in `providerContractTestHarness.ts`. The adjacent contract test uses only a test-local provider definition and covers scalar metadata, numeric parsing, masked edit defaults, environment and TTL defaults, validation, create/edit adapters, gateway and username-template normalization, nested values, registry composition, and a custom-renderer escape hatch.

Run it from `frontend/`:

```sh
TSX_TSCONFIG_PATH=tsconfig.app.json ./node_modules/.bin/tsx --test src/components/dynamic-secrets/DynamicSecretProviderForm/*.test.ts
```
