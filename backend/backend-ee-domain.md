# EE domain

EE code lives inside the domain it extends, in an `ee/` folder, as an ordinary module that provides hooks to the community module. Community code never imports EE. We ship one build, and the license switches paid features on per organization at runtime.

## What EE is

EE is functionality we sell to enterprise customers and do not give away for free. It is defined by what the customer gets, so it can take any of these forms:

| Form                                    | Example                        | What is EE                                 |
| --------------------------------------- | ------------------------------ | ------------------------------------------ |
| A whole domain                          | Dynamic secrets, PAM, KMIP     | Every layer                                |
| Extra endpoints on a community resource | Secret access list             | A router and the service behind it         |
| Behavior inside a community flow        | Approval before a secret write | One implementation behind a community hook |

## Why community never imports EE

EE is an extension of community, so the dependency points one way. This holds even with a single build:

| Reason                                    | Today, without the rule                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Paid logic stays in one place             | `getPlan()` checks sit in 56 community files, so a missed check leaks or blocks a feature |
| No import cycles                          | Community and EE import each other; Go refuses to compile cycles                          |
| Community code reads and tests on its own | The secret write path mixes in approval logic, and its tests need approval fakes          |
| The `ee/` license means something         | Community-licensed code that only works with EE code makes the label misleading           |

It also keeps the option open: a community build or private EE modules later change only the wiring.

## How others do it

|                 | HashiCorp Vault                        | Grafana                                  | GitLab                                        |
| --------------- | -------------------------------------- | ---------------------------------------- | --------------------------------------------- |
| Where EE lives  | Private repo, a copy of the public one | Private repo, linked in at build time    | Same repo, `ee/` folder                       |
| How EE plugs in | `_ce.go` stubs swapped by build tag    | Interfaces swapped by the EE wiring file | `prepend_mod` at the end of a community class |

GitLab's [modular monolith design](https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/modular_monolith/hexagonal_monolith/) moves `ee/` into each bounded context. We follow that layout, in one repo and one build.

## How EE plugs in

EE code is ordinary modules. Three terms cover all wiring:

| Term | Meaning |
| --- | --- |
| Module | A domain's public surface: its service, its routes, and the hooks it provides to other modules |
| Service | What other modules call to use a domain |
| Hook | A function a module accepts so another module can change one step of its flow. Optional, with a default. |

`ee/` is a folder for licensed code, not a mechanism. A module in `<domain>/ee` and a separate EE domain plug in the same way: they provide hooks and register their own routes.

## Example

Approval before a secret write. The write is community; the approval check is EE.

```ts
// secrets/static-secrets/module.ts (community)
export type TStaticSecretsHooks = {
  checkWrite?: (write: TSecretWrite) => Promise<"allow" | "needs-approval">;
};
export class StaticSecretsModule {
  constructor(deps: TStaticSecretsDependencies, hooks: TStaticSecretsHooks = {}) { ... }
}

// secrets/static-secrets/ee/module.ts (EE)
export class StaticSecretsEeModule {
  readonly hooks: TStaticSecretsHooks = {
    checkWrite: async (write) => {
      if (!(await this.billingCore.hasFeature(write.orgId, "secretApproval"))) return "allow";
      return (await this.policies.findFor(write)) ? "needs-approval" : "allow";
    }
  };
}

// domains.ts (the one file that imports ee/)
const staticSecretsEe = new StaticSecretsEeModule({ db, billingCore: billingCore.service });
const staticSecrets = new StaticSecretsModule({ db, kmsCore: kmsCore.service }, staticSecretsEe.hooks);
```

The secret service calls `hooks.checkWrite?.(write)` and never knows approvals exist. A full working version is in `backend/src/domains-poc/platform/kms-core`, where EE external KMS provides the `unwrapOrgKey` hook.

## Shared capabilities

Permission, audit log and license are needed by every domain, so their interfaces live in community. Each has one implementation, which checks the license itself.

```ts
// platform/audit-log/module.ts (community)
export interface TAuditLogService {
  record(event: TAuditEvent): Promise<void>;
}

// platform/audit-log/ee/audit-log-service.ts (EE)
export class AuditLogService implements TAuditLogService {
  async record(event: TAuditEvent) {
    if (!(await this.billingCore.hasFeature(event.orgId, "auditLogs"))) return;
    await this.auditLogs.insert(event);
  }
}
```

A community build would add a free implementation per interface, as GitLab does: its free edition answers `licensed_feature_available?` with `false`.

## Rules

| Rule | Enforced by |
| --- | --- |
| Use a module through its service; change it through its hooks. Nothing else crosses a module boundary. | Review |
| A module that provides hooks is built before the module that takes them. A provider that also needs the taker's service is a cycle: move the boundary. | Wiring in `domains.ts` |
| Only `domains.ts` imports from an `ee/` folder outside it | Oxlint `no-restricted-imports` |
| `<domain>/ee` may import anything from its own domain; other domains import only a module's types | Oxlint |
| Community may ask Billing Core if a feature is on; only EE reads the license | Review |

## Open questions

| Question                                                         | Owner   |
| ---------------------------------------------------------------- | ------- |
| Which parts of permission and audit are paid?                    | Product |
| Is Gateway community or EE? Community integrations use it today. | Product |
