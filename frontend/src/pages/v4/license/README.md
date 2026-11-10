# v4 upgrade gate

The v4 twin of main's `components/license/UpgradeGate`. Import from `pages/v4/license` (relative path from your page). The intents and plan logic stay in main's logic files and are imported in place: `upgrade-intents.ts`, `capability-upgrade-intents.ts`, `plan-catalog.ts`, `environment-limit.ts`, `product-plan-summary.ts` and `self-hosted-license.ts`. Only the UI lives here.

## Intents

An intent says what the person tried to use and which plan unlocks it.

- **Product intents** (`UpgradeIntent`, from `@app/components/license/UpgradeGate/upgrade-intents`) name a billing product and plan, such as `DynamicSecretsUpgradeIntent` or `HoneyTokensUpgradeIntent`. The gate loads the billing overview and catalog, shows that product's plans, and offers a free trial, Contact sales or a link to root billing depending on the plan and the person's billing permissions. Pass `quota` and `quotaNotice` on the intent for limit-reached gates (honey tokens, environments).
- **Capability intents** (`CapabilityUpgradeIntent`, from `@app/components/license/UpgradeGate/capability-upgrade-intents`) have a `scope` of `platform`, `product` or `instance`, such as `GroupsUpgradeIntent` or `InstanceHsmUpgradeIntent`. The gate explains where the feature is licensed and links to billing, or to sales for instance features and Agent Vault.

## paywallKey

A stable string naming the place the gate opened from, such as `"secrets-overview-dynamic-secret"`. It is sent with the `PaywallViewed` and `PaywallUpgradeClicked` analytics events (not in demo mode). Keep the key main uses for the same paywall so the funnels stay comparable.

## UpgradeGate

```tsx
<UpgradeGate
  intent={DynamicSecretsUpgradeIntent}
  paywallKey="secrets-overview-dynamic-secret"
  isOpen={isOpen}
  onOpenChange={setIsOpen}
/>
```

Takes either intent kind. Product intents also accept `initialTier` (the plan tab to open on) and `initialCadence` (`"annual"` by default). Capability intents also accept `alternative`, `onOpenAutoFocus` and `onCloseAutoFocus`.

## useUpgradeGate

For a page with several product gates, the hook holds the open request and renders the dialog:

```tsx
const { openUpgradeGate, upgradeGate } = useUpgradeGate();

<Button disabledReason={...} onClick={() => openUpgradeGate({ intent: SecretRotationsUpgradeIntent, paywallKey: "secret-rotations" })} />
{upgradeGate}
```

## CapabilityUpgradeGate

The capability dialog on its own, with main's props: `intent` (a `CapabilityUpgradeIntent`), `paywallKey`, `isOpen`, `onOpenChange`, and the optional `alternative` (`{ title, description, actionLabel, onSelect }`, for a free path such as a smaller option), `onOpenAutoFocus` and `onCloseAutoFocus`. `UpgradeGate` renders it for any intent with a `scope`.

## Plan feature helpers

`PlanFeatureIcon({ value })` and `formatPlanFeatureTitle(feature)` render a `PlanFeature` (`{ label, value?, description? }`, what `getPlanFeatures` returns) the same way the gate does, for the billing plans view.

## Data

Org, subscription and billing data come from the v4 adapters: `useV4Adapter("org").useOrganization` for the root org, and `useV4Adapter("billing")` for `useSubscription`, `useOverview`, `useCatalog`, `useStartTrial` and `useRefreshSubscription`. Permissions come from `useOrgPermission` in `pages/v4/access/permissions`.
