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
  },
  {
    id: "autofill",
    title: "Autofill keeps the field",
    description:
      "Fields the browser autofills keep their own ground and text color in every theme instead of Chrome's blue fill.",
    date: "2026-11-07",
    commit: "7e0192cd9a",
    page: "input"
  },
  {
    id: "mono-rule",
    title: "Mono for machine values",
    description:
      "Names people choose render in sans; mono is kept for keys, IDs, hashes, hosts and code, with a lint for mono names.",
    date: "2026-11-07",
    commit: "1a51d0cb78",
    page: "text"
  },
  {
    id: "quiet-link",
    title: "Quiet links",
    description:
      "A link Button can drop its underline until hover or keyboard focus, and named row buttons that open a sheet now use it.",
    date: "2026-11-07",
    commit: "9b822efc12",
    page: "button"
  },
  {
    id: "loading-rows",
    title: "Loading rows and queues",
    description:
      "Native tables and ApprovalQueue get the same skeleton loading as DataTable, and a tall error page no longer clips at the top.",
    date: "2026-11-07",
    commit: "11c4467d3c",
    page: "table"
  },
  {
    id: "boot-loader",
    title: "Boot loader and route progress",
    description:
      "v4 boots on its theme's ground with a labelled BootLoader, and navigations show a quiet progress bar instead of NProgress.",
    date: "2026-11-07",
    commit: "8796ac7b20",
    page: "loader"
  },
  {
    id: "preview-v4",
    title: "v4 on previews",
    description:
      "Preview deploys open in v4 by default, and main's login, signup and org home send you to their v4 pages while the flag is on.",
    date: "2026-11-07",
    commit: "072c1e484c",
    page: "overview"
  },
  {
    id: "error-state-forbidden",
    title: "Forbidden error state",
    description:
      "ErrorState adds You don't have access, and pages can slot their own flows such as Request access.",
    date: "2026-11-07",
    commit: "7b36bf4064",
    page: "error-state"
  }
];
