import { type IconName } from "@app/components/v4/ui/icon";

import { type ComparisonPage } from "./navigation";

export type PortStatus = "1:1 port" | "Reworked port" | "Redesign";

export const comparisonQuicklinks: {
  page: ComparisonPage;
  icon: IconName;
  summary: string;
  status: PortStatus;
}[] = [
  {
    page: "compare-shell",
    icon: "sidebar",
    summary: "Top band outside the content card, sidebar corner and reworked menus.",
    status: "Redesign"
  },
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
    summary: "The inventory with FilterBar chips and a detail page with a sidecar.",
    status: "Reworked port"
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
    summary: "Connections with a status column, and creation in a three-step Sheet.",
    status: "Reworked port"
  },
  {
    page: "compare-identities",
    icon: "machine",
    summary: "Identities with sign-in status, and a detail page with a sidecar.",
    status: "Reworked port"
  },
  {
    page: "compare-audit-logs",
    icon: "history",
    summary: "A virtual DataTable with time ranges and FilterBar chips.",
    status: "Reworked port"
  },
  {
    page: "compare-secret-scanning",
    icon: "search",
    summary: "Findings with author and commit, status and source filters.",
    status: "Reworked port"
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
    id: "ui-generate",
    title: "ui:generate rewrite",
    description:
      "Parses with oxc-parser, checks declared axes from syntax and splices examples from source.",
    date: "2026-11-03",
    commit: "1274011a3f"
  },
  {
    id: "inf-19",
    title: "INF-19: App shell",
    description:
      "A top band outside the content card, a sidebar corner with help and the rail, and reworked organization and user menus.",
    date: "2026-11-03",
    commit: "2025c748b6",
    page: "top-bar"
  },
  {
    id: "inf-18",
    title: "INF-18: Breadcrumbs",
    description:
      "A vertical divider between crumbs; a crumb's name navigates and its chevron opens the switcher.",
    date: "2026-11-03",
    commit: "63b48cc758",
    page: "breadcrumb"
  },
  {
    id: "inf-15",
    title: "INF-15: Color",
    description:
      "Accent create actions, a new default yellow, a theme-invariant danger fill and a neutral dark selected state.",
    date: "2026-11-02",
    commit: "c187956b5e",
    page: "colors"
  },
  {
    id: "row-actions",
    title: "Row actions",
    description:
      "Persistent row actions in a centered, content-sized sticky column; the selection column gets a divider.",
    date: "2026-11-02",
    commit: "11a679dc21",
    page: "data-table"
  },
  {
    id: "sheet-skeleton",
    title: "Sheet skeleton",
    description:
      "Sheet and Dialog pin the header and footer with full-bleed rules, so only the body scrolls.",
    date: "2026-11-02",
    commit: "ae33ae8198",
    page: "sheet"
  }
];
