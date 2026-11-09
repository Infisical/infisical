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
    id: "pinned-edge-fade",
    title: "Pinned edge fade",
    description:
      "Content scrolling under a pinned column fades into that row's own ground instead of meeting a hard line.",
    date: "2026-11-07",
    commit: "3ace3fae11",
    page: "table"
  },
  {
    id: "row-actions-lazy-default",
    title: "Lazy row actions by default",
    description:
      "DataTable row actions stay plain buttons until a row is hovered or focused, so large tables carry no idle menus.",
    date: "2026-11-07",
    commit: "4544b9cd6f",
    page: "table"
  },
  {
    id: "has-rest",
    title: "No :has() in v4",
    description:
      "Every v4 component sets its states directly, and a lint keeps :has() and unscoped logical insets out of v4 CSS.",
    date: "2026-11-07",
    commit: "9beb0637cd",
    page: "table"
  },
  {
    id: "has-tables",
    title: "Tables without :has()",
    description:
      "Table and row states come from attributes the components set, so an edit inside a large table no longer restyles the whole table.",
    date: "2026-11-07",
    commit: "6f0843c796",
    page: "table"
  },
  {
    id: "button-plain",
    title: "Lighter buttons",
    description:
      "Buttons render a plain element now that press feedback is CSS, which makes button-heavy tables mount faster.",
    date: "2026-11-07",
    commit: "7b78041dbe",
    page: "button"
  },
  {
    id: "row-actions-lazy",
    title: "Lazy row actions",
    description:
      "Row actions can render as plain buttons until a row is hovered or focused, and pages can open the More menu themselves.",
    date: "2026-11-07",
    commit: "b7ba7061e7",
    page: "table"
  },
  {
    id: "row-context-lazy",
    title: "Lighter row menus",
    description:
      "Right-click row menus mount only when opened, so large tables carry no closed menus.",
    date: "2026-11-07",
    commit: "7a2ed78093",
    page: "table"
  },
  {
    id: "viewport-cell-perf",
    title: "Faster table edits",
    description:
      "Editing inside a large table no longer pays for the full-width cell's styling when no row uses it.",
    date: "2026-11-07",
    commit: "3f2f553a29",
    page: "table"
  },
  {
    id: "shared-tooltips",
    title: "One tooltip per table",
    description:
      "Tooltips inside a table share a single instance, so large tables mount faster with the same hover and keyboard behavior.",
    date: "2026-11-07",
    commit: "9f6084dc3e",
    page: "tooltip"
  },
  {
    id: "list-whole-rows",
    title: "Lists end on a whole row",
    description:
      "Multi-select, combobox and command lists size to whole rows, so the last visible option is never cut.",
    date: "2026-11-07",
    commit: "dfbd72f4c0",
    page: "multi-select"
  },
  {
    id: "bulk-action-reason",
    title: "Blocked bulk actions explain why",
    description:
      "A disabled bulk action stays focusable and shows its reason on hover and keyboard focus.",
    date: "2026-11-07",
    commit: "f2ee386887",
    page: "floating-action-bar"
  },
  {
    id: "leading-pin",
    title: "Leading pins",
    description:
      "Selection and name columns can pin to the start of a wide table, and an expanded row's nested content stays in view while the table scrolls sideways.",
    date: "2026-11-07",
    commit: "cb490b4bba",
    page: "table"
  },
  {
    id: "menu-item-description",
    title: "Reasons on checkbox items",
    description:
      "Checkbox and radio menu items take a description, so a disabled setting can say why it is unavailable.",
    date: "2026-11-07",
    commit: "804076293d",
    page: "dropdown-menu"
  },
  {
    id: "row-focus",
    title: "Row focus",
    description:
      "A row being edited can be marked focused, and every other row in the table fades until the edit ends.",
    date: "2026-11-07",
    commit: "0da7164369",
    page: "table"
  },
  {
    id: "bulk-bar-window",
    title: "Bulk bar at the window",
    description:
      "The bulk action bar sits at the bottom center of the window on every table, and the page pads itself so nothing hides behind it.",
    date: "2026-11-07",
    commit: "2f8f8ef459",
    page: "floating-action-bar"
  }
];
