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
    id: "access-undo-toast",
    title: "Undo revokes from a toast",
    description:
      "Revoking access shows a toast with Undo for ten seconds, and focus moves to the next member.",
    date: "2026-11-07",
    commit: "2e5c570f39",
    page: "access-list"
  },
  {
    id: "toast-errors",
    title: "Error toasts stay put",
    description:
      "Error toasts are announced right away, stay until you close them, and every toast has a close button.",
    date: "2026-11-07",
    commit: "b2ff57a491",
    page: "toast"
  },
  {
    id: "header-no-hover",
    title: "Headers stay still on hover",
    description:
      "Hovering a table header no longer tints the whole row. Only a full-cell header trigger, like a sort, takes a hover.",
    date: "2026-11-07",
    commit: "63eb87adc8",
    page: "table"
  },
  {
    id: "pinned-edge-line",
    title: "Pinned edges hold their line",
    description:
      "Pinned name and action columns keep a hard edge as content scrolls under them, with the fade outside it.",
    date: "2026-11-07",
    commit: "c631c433d4",
    page: "table"
  },
  {
    id: "toast-live-regions",
    title: "Toasts announce reliably",
    description:
      "Toast stacks announce every new toast through live regions that exist before the first one, errors assertively.",
    date: "2026-11-07",
    commit: "65a7781fb1",
    page: "toast"
  },
  {
    id: "action-feedback-toast",
    title: "Action feedback in toasts",
    description:
      "Copy, save, delete and other action results show as toasts. The table footer only carries state that has to stay visible, like a filtered count.",
    date: "2026-11-07",
    commit: "878b79110b",
    page: "toast"
  },
  {
    id: "toast-anatomy",
    title: "Toast layout",
    description:
      "Toast titles take the full width, actions sit as quiet buttons on their own row, and a long title wraps in a wider toast instead of a tall narrow one.",
    date: "2026-11-07",
    commit: "12a6830860",
    page: "toast"
  },
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
  }
];
