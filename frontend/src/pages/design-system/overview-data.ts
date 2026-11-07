import { type IconName } from "@app/components/v4/ui/icon";

import { type ComparisonPage } from "./navigation";

export type PortStatus = "1:1 port" | "Redesign";

export const comparisonQuicklinks: {
  page: ComparisonPage;
  icon: IconName;
  summary: string;
  status: PortStatus;
}[] = [
  {
    page: "compare-home",
    icon: "home",
    summary: "Products as a card grid with their counts in the card frame band.",
    status: "Redesign"
  },
  {
    page: "compare-secrets",
    icon: "key",
    summary: "The Secrets Overview with every add flow, row action and scenario.",
    status: "1:1 port"
  },
  {
    page: "compare-access",
    icon: "user",
    summary: "Users, identities, groups, tokens and roles, with every flow from main.",
    status: "1:1 port"
  },
  {
    page: "compare-settings",
    icon: "settings",
    summary: "The same General sections and fields, as SettingsCard sections.",
    status: "1:1 port"
  },
  {
    page: "compare-approvals",
    icon: "check-c",
    summary: "The change request table becomes an ApprovalQueue.",
    status: "Redesign"
  },
  {
    page: "compare-certificates",
    icon: "cert",
    summary: "The same inventory and certificate detail page, filtered with FilterBar chips.",
    status: "1:1 port"
  },
  {
    page: "compare-kms",
    icon: "lock",
    summary: "The same keys and columns in a DataTable with key actions.",
    status: "1:1 port"
  },
  {
    page: "compare-connections",
    icon: "link",
    summary: "The same app connections, with New connection in a three-step Sheet.",
    status: "1:1 port"
  },
  {
    page: "compare-identities",
    icon: "machine",
    summary: "The same machine identities, each opening its details, auth methods and projects.",
    status: "1:1 port"
  },
  {
    page: "compare-audit-logs",
    icon: "history",
    summary: "The same organization events in a virtual DataTable with FilterBar chips.",
    status: "1:1 port"
  },
  {
    page: "compare-secret-scanning",
    icon: "search",
    summary: "The same unresolved findings, with status and source filters and bulk triage.",
    status: "1:1 port"
  }
];

export const recentChanges: {
  id: string;
  title: string;
  description: string;
  date: string;
  commit: string;
  page?: string;
}[] = [
  {
    id: "container-defaults",
    title: "Container defaults",
    description:
      "Tables and lists stay framed, and a standalone Card is plain by default, framed only for emphasis or as a section card.",
    date: "2026-11-07",
    commit: "aab51e979e",
    page: "card"
  },
  {
    id: "themes",
    title: "Four themes",
    description:
      "Peach, Pale, Dark and Dark alt are named themes with a light or dark scheme, picked from the account and workbench menus.",
    date: "2026-11-07",
    commit: "c700ce77aa",
    page: "colors"
  },
  {
    id: "line-roles",
    title: "Line roles",
    description:
      "line-soft is the default border for edges and the dividers that meet them, and line is kept for standalone rules such as a lone Separator.",
    date: "2026-11-06",
    commit: "3c11d43aee",
    page: "rules"
  },
  {
    id: "approve-accent",
    title: "Accent Approve",
    description:
      "Approve is the accent Button in every ApprovalQueue variant, and resolved rows in divided lists get their own visible fill.",
    date: "2026-11-06",
    commit: "578b7519dd",
    page: "approval-queue"
  },
  {
    id: "list-variants",
    title: "List variants",
    description:
      "List owns the framed, plain, bare, segmented and divided variants with header, section and footer parts, and ApprovalQueue inherits them.",
    date: "2026-11-06",
    commit: "cdb1507383",
    page: "list"
  },
  {
    id: "list-meta",
    title: "List row timestamps",
    description:
      "A list row's title ellipsizes on one line, so its timestamp stays pinned beside it.",
    date: "2026-11-06",
    commit: "7ba6dacc87",
    page: "list"
  },
  {
    id: "crumb-cursor",
    title: "Crumbs and cursors",
    description:
      "Combined crumbs are one button with no dead pixels, and only links take the pointer cursor.",
    date: "2026-11-06",
    commit: "02076b65ee",
    page: "breadcrumb"
  },
  {
    id: "draggable-popover",
    title: "Draggable Popover",
    description:
      "A Popover can opt in to a Move handle, with keyboard steps, a viewport clamp and a reset when it reopens.",
    date: "2026-11-06",
    commit: "82721e1d76",
    page: "popover"
  },
  {
    id: "selection-column",
    title: "Selection column",
    description:
      "Native tables and DataTable share one selection hook, and icon columns that double as selection can drop the divider.",
    date: "2026-11-06",
    commit: "75c373c9f0",
    page: "table"
  },
  {
    id: "combobox-creation",
    title: "Create from a picker",
    description:
      "A Combobox can create the entity it picks in a dialog, starting with app connections, so nobody leaves the flow.",
    date: "2026-11-06",
    commit: "d1c73789d8",
    page: "combobox"
  },
  {
    id: "actions-tail",
    title: "Actions tail",
    description:
      "Striped rows paint across pinned cells, the actions tail end-aligns at row-target height and destructive actions go last in More.",
    date: "2026-11-06",
    commit: "d05df39e77",
    page: "table"
  },
  {
    id: "toast-disabled",
    title: "Toasts and disabled reasons",
    description:
      "The shell hosts toasts, and a disabled Button explains why in a tooltip through disabledReason.",
    date: "2026-11-05",
    commit: "32e2402f30",
    page: "toast"
  },
  {
    id: "grouped-rows",
    title: "Grouped rows",
    description: "DataTable groups rows under header rows and nests one level of child rows.",
    date: "2026-11-05",
    commit: "94a2ac115f",
    page: "table"
  },
  {
    id: "nested-overlays",
    title: "Nested menus",
    description:
      "Submenus portal into the v4 layer, so they paint above and beside their parent menu.",
    date: "2026-11-05",
    commit: "3a41c65e00",
    page: "dropdown-menu"
  },
  {
    id: "badge-field-mapping",
    title: "Badges and FieldMapping",
    description:
      "Badges that share a row with controls take control height, and FieldMapping pairs source and destination fields.",
    date: "2026-11-04",
    commit: "35dce26df3",
    page: "field-mapping"
  }
];
