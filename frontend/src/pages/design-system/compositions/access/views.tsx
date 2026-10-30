import { createContext, useContext, useMemo, useState } from "react";

import { Select } from "@app/components/v4/ui/select";

import { ComparisonSlider } from "../../comparison-slider";
import type { AccessStart } from "./context";
import { type Scenario, scenarios } from "./model";

export type AccessView = {
  value: string;
  label: string;
  start: AccessStart;
  scenario?: Scenario;
};

export const accessViews: AccessView[] = [
  { value: "org-users", label: "Organization: Users", start: {} },
  { value: "org-users-search", label: "Organization: Users, search", start: { overlay: "search" } },
  {
    value: "org-users-edit-role",
    label: "Organization: Users, edit role",
    start: { overlay: "edit-role" }
  },
  {
    value: "org-users-filter",
    label: "Organization: Users, role filter",
    start: { overlay: "filter" }
  },
  {
    value: "org-users-row-menu",
    label: "Organization: Users, row actions",
    start: { overlay: "row-menu" }
  },
  {
    value: "org-users-bulk",
    label: "Organization: Users, bulk selection",
    start: { overlay: "bulk" }
  },
  { value: "org-invite", label: "Organization: Invite users", start: { overlay: "invite" } },
  { value: "org-users-remove", label: "Organization: Remove user", start: { overlay: "remove" } },
  {
    value: "org-user-detail",
    label: "Organization: User details",
    start: { nav: { detail: { kind: "org-member", id: "m-priya", label: "Priya Raman" } } }
  },
  {
    value: "org-identities",
    label: "Organization: Machine identities",
    start: { nav: { orgTab: "identities" } }
  },
  {
    value: "org-identity-row-menu",
    label: "Organization: Machine identities, row actions",
    start: { nav: { orgTab: "identities" }, overlay: "row-menu" }
  },
  {
    value: "org-loading",
    label: "Organization: Machine identities, loading",
    start: { nav: { orgTab: "identities" } },
    scenario: "loading"
  },
  {
    value: "org-identity-create",
    label: "Organization: Create machine identity",
    start: { nav: { orgTab: "identities" }, overlay: "create" }
  },
  {
    value: "org-identity-detail",
    label: "Organization: Machine identity details",
    start: {
      nav: {
        detail: {
          kind: "org-identity",
          id: "4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11",
          label: "ci-deployer",
          mono: true
        }
      }
    }
  },
  { value: "org-groups", label: "Organization: Groups", start: { nav: { orgTab: "groups" } } },
  {
    value: "org-group-row-menu",
    label: "Organization: Groups, row actions",
    start: { nav: { orgTab: "groups" }, overlay: "row-menu" }
  },
  {
    value: "org-empty-groups",
    label: "Organization: Groups, empty",
    start: { nav: { orgTab: "groups" } },
    scenario: "empty"
  },
  {
    value: "org-group-create",
    label: "Organization: Create group",
    start: { nav: { orgTab: "groups" }, overlay: "create" }
  },
  {
    value: "org-group-detail",
    label: "Organization: Group details",
    start: { nav: { detail: { kind: "org-group", id: "g-platform", label: "platform-eng" } } }
  },
  { value: "org-roles", label: "Organization: Roles", start: { nav: { orgTab: "roles" } } },
  {
    value: "org-role-row-menu",
    label: "Organization: Roles, row actions",
    start: { nav: { orgTab: "roles" }, overlay: "row-menu" }
  },
  {
    value: "org-role-create",
    label: "Organization: Create role",
    start: { nav: { orgTab: "roles" }, overlay: "create" }
  },
  {
    value: "org-role-detail",
    label: "Organization: Role editor",
    start: { nav: { detail: { kind: "org-role", id: "r-auditor", label: "Security auditor" } } }
  },
  {
    value: "org-role-add-policy",
    label: "Organization: Role editor, add policies",
    start: {
      nav: { detail: { kind: "org-role", id: "r-auditor", label: "Security auditor" } },
      overlay: "add-policy"
    }
  },
  { value: "org-denied", label: "Organization: No access", start: {}, scenario: "denied" },
  {
    value: "org-denied-tab",
    label: "Organization: Roles, no access to the tab",
    start: { nav: { orgTab: "roles" } },
    scenario: "restricted"
  },
  { value: "proj-members", label: "Project: Users", start: { nav: { scope: "project" } } },
  {
    value: "proj-members-filter",
    label: "Project: Users, role filter",
    start: { nav: { scope: "project" }, overlay: "filter" }
  },
  {
    value: "proj-members-row-menu",
    label: "Project: Users, row actions",
    start: { nav: { scope: "project" }, overlay: "row-menu" }
  },
  {
    value: "proj-add-member",
    label: "Project: Add users",
    start: { nav: { scope: "project" }, overlay: "add" }
  },
  {
    value: "proj-remove-member",
    label: "Project: Remove user",
    start: { nav: { scope: "project" }, overlay: "remove" }
  },
  {
    value: "proj-member-detail",
    label: "Project: User details",
    start: {
      nav: {
        scope: "project",
        detail: { kind: "project-member", id: "pm-diego", label: "Diego Alvarez" }
      }
    }
  },
  {
    value: "proj-member-edit-roles",
    label: "Project: Edit roles with temporary access",
    start: {
      nav: {
        scope: "project",
        detail: { kind: "project-member", id: "pm-diego", label: "Diego Alvarez" }
      },
      overlay: "edit-roles"
    }
  },
  {
    value: "proj-identities",
    label: "Project: Machine identities",
    start: { nav: { scope: "project", projectTab: "identities" } }
  },
  {
    value: "proj-identities-row-menu",
    label: "Project: Machine identities, row actions",
    start: { nav: { scope: "project", projectTab: "identities" }, overlay: "row-menu" }
  },
  {
    value: "proj-identity-add",
    label: "Project: Add machine identity",
    start: { nav: { scope: "project", projectTab: "identities" }, overlay: "add" }
  },
  {
    value: "proj-identity-add-create-new",
    label: "Project: Create project machine identity",
    start: { nav: { scope: "project", projectTab: "identities" }, overlay: "add-create-new" }
  },
  {
    value: "proj-groups",
    label: "Project: Groups",
    start: { nav: { scope: "project", projectTab: "groups" } }
  },
  {
    value: "proj-group-add",
    label: "Project: Add group",
    start: { nav: { scope: "project", projectTab: "groups" }, overlay: "add" }
  },
  {
    value: "proj-service-tokens",
    label: "Project: Service tokens",
    start: { nav: { scope: "project", projectTab: "service-tokens" } }
  },
  {
    value: "proj-service-token-create",
    label: "Project: Create service token",
    start: { nav: { scope: "project", projectTab: "service-tokens" }, overlay: "create" }
  },
  {
    value: "proj-roles",
    label: "Project: Roles",
    start: { nav: { scope: "project", projectTab: "roles" } }
  },
  {
    value: "proj-role-create",
    label: "Project: Create role",
    start: { nav: { scope: "project", projectTab: "roles" }, overlay: "create" }
  },
  {
    value: "proj-role-detail",
    label: "Project: Role editor",
    start: {
      nav: {
        scope: "project",
        detail: { kind: "project-role", id: "p-deploy-reviewer", label: "Deploy bot reviewer" }
      }
    }
  },
  {
    value: "proj-role-conditions",
    label: "Project: Role editor, conditions",
    start: {
      nav: {
        scope: "project",
        detail: { kind: "project-role", id: "p-deploy-reviewer", label: "Deploy bot reviewer" }
      },
      overlay: "conditions"
    }
  },
  {
    value: "proj-role-add-policy",
    label: "Project: Role editor, add policies",
    start: {
      nav: {
        scope: "project",
        detail: { kind: "project-role", id: "p-deploy-reviewer", label: "Deploy bot reviewer" }
      },
      overlay: "add-policy"
    }
  },
  {
    value: "proj-loading",
    label: "Project: Users, loading",
    start: { nav: { scope: "project" } },
    scenario: "loading"
  }
];

type ViewState = { view: AccessView; scenario: Scenario };
const AccessViewContext = createContext<ViewState>({ view: accessViews[0], scenario: "default" });
export const useAccessView = () => useContext(AccessViewContext);

const shots = import.meta.glob<string>("../../assets/comparisons/access/*.webp", {
  eager: true,
  import: "default",
  query: "?url"
});
const shot = (view: string, theme: "light" | "dark") =>
  shots[`../../assets/comparisons/access/${view}-${theme}.webp`];

export function AccessComparison({ After }: { After: React.ComponentType }) {
  const [viewId, setViewId] = useState(accessViews[0].value);
  const [scenario, setScenario] = useState<Scenario>("default");
  const view = accessViews.find((item) => item.value === viewId) ?? accessViews[0];
  const effective = view.scenario ?? scenario;
  const context = useMemo(() => ({ view, scenario: effective }), [view, effective]);
  return (
    <AccessViewContext.Provider value={context}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground text-sm">Page or flow</span>
        <div style={{ width: 360 }}>
          <Select
            label="Access control page or flow"
            value={viewId}
            options={accessViews.map(({ value, label }) => ({ value, label }))}
            onChange={setViewId}
          />
        </div>
        <span className="text-muted-foreground text-sm">Local demo data</span>
        <div style={{ width: 280 }}>
          <Select
            label="Access control scenario"
            value={effective}
            disabled={Boolean(view.scenario)}
            options={scenarios}
            onChange={(value) => setScenario(value as Scenario)}
          />
        </div>
        <span className="text-muted-foreground text-xs">
          Changes stay in this preview. No requests are sent.
        </span>
      </div>
      <ComparisonSlider
        key={view.value}
        title={`Access control, ${view.label}`}
        before={{ light: shot(view.value, "light"), dark: shot(view.value, "dark") }}
        After={After}
      />
    </AccessViewContext.Provider>
  );
}
