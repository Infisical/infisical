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
    id: "card-pairs",
    title: "Bands, xs Input and flush SettingsCard",
    description:
      "Framed band labels sit at one height, Input gains a 24px xs size, and a flush SettingsCard embeds a table.",
    date: "2026-11-07",
    commit: "45ad1c70c1",
    page: "settings-card"
  },
  {
    id: "shared-hover",
    title: "Shared hover",
    description:
      "Every hover and press is one ink overlay tuned by hover-mix and press-mix, darker in light themes and brighter in dark ones.",
    date: "2026-11-07",
    commit: "b7593b3735",
    page: "colors"
  },
  {
    id: "button-corner-badge",
    title: "Button corner badge",
    description:
      "A Button can carry a small Badge on its top-right corner, such as Last used, without changing its size or hit area.",
    date: "2026-11-07",
    commit: "7ff23542fa",
    page: "button"
  },
  {
    id: "dark-alt-two-colors",
    title: "Dark alt, two colors",
    description:
      "Dark alt now differs from Dark only in its sidebar and inset; every other color inherits.",
    date: "2026-11-07",
    commit: "4da1f58249",
    page: "colors"
  },
  {
    id: "tooltip-pass-through",
    title: "Pass-through tooltips",
    description:
      "Tooltips close as the pointer leaves, never catch clicks, and no longer reopen when focus returns from a menu, dialog or sheet.",
    date: "2026-11-07",
    commit: "7371831b2f",
    page: "tooltip"
  },
  {
    id: "no-nested-frames",
    title: "No frames in frames",
    description:
      "A table, list or card inside a framed container drops its own frame, and a plain Card pads its content like a framed one.",
    date: "2026-11-07",
    commit: "0e62ac760f",
    page: "card"
  },
  {
    id: "link-rows-grid",
    title: "Link rows and 1:2 grid",
    description:
      "ListRow takes a router link, Grid gains a 1:2 split that stacks below 896px, and a ToggleGroup no longer shrinks under its neighbours.",
    date: "2026-11-07",
    commit: "dca88d2ce5",
    page: "list"
  },
  {
    id: "strategic-descriptions",
    title: "Strategic descriptions",
    description:
      "Descriptions are optional and earn their place: a one-sentence lede, a scoping subtitle or a line that tells cards apart.",
    date: "2026-11-07",
    commit: "88efc85d88",
    page: "rules"
  },
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
  }
];
