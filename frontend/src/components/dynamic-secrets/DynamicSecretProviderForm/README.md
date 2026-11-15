# Dynamic-secret provider form contract

The shared contract keeps one create/edit form shell while leaving provider validation, defaults, hydration, and request adapters with each provider definition. The foundation is intentionally provider-neutral; each provider registers its definition through a batch module.

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

Providers are grouped into batch modules under `providerDefinitions/`. A module imports its concrete definitions and exports only the shared registration contract:

```ts
export const identityAccessDynamicSecretProviders = defineDynamicSecretProviderModule({
  id: "identity-access",
  definitions: [awsIamDynamicSecretProvider, gcpIamDynamicSecretProvider]
});
```

The production composition root, `productionRegistry.ts`, combines the batches:

```ts
export const dynamicSecretProviderRegistry = createDynamicSecretProviderRegistry(
  relationalWarehouseDynamicSecretProviders,
  dataProtocolDynamicSecretProviders,
  managedStoresDynamicSecretProviders,
  identityAccessDynamicSecretProviders
);
```

`getDefinition(provider)` returns `undefined` for an unregistered provider; the edit form shows an error in place of the form. `requireDefinition(provider)` is for code paths that already proved registration. Duplicate module IDs and duplicate providers fail during composition instead of silently overriding a definition.

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
