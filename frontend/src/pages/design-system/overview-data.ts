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
    id: "table-rules",
    title: "Table rules",
    description:
      "Navigation, pagination, sheet rows, context menus, facts density, inline actions, toolbars, bulk bars and tables in cards each have one rule.",
    date: "2026-11-07",
    commit: "c2b9967476",
    page: "table"
  },
  {
    id: "row-ring-width",
    title: "Row rings keep column widths",
    description:
      "A focused table row no longer narrows its columns, and the error details panel drops its repeated label.",
    date: "2026-11-07",
    commit: "a3f075ef64",
    page: "table"
  },
  {
    id: "context-menu-release",
    title: "Safer context menus",
    description:
      "Releasing the right button that opened a context menu can no longer pick the item that lands under the cursor.",
    date: "2026-11-07",
    commit: "a843510f1d",
    page: "context-menu"
  },
  {
    id: "error-state",
    title: "Error and 404 pages",
    description:
      "ErrorState gives v4 a quiet Page not found and Something went wrong, inside the shell or full-page when the shell fails.",
    date: "2026-11-07",
    commit: "522e7b336a",
    page: "error-state"
  },
  {
    id: "row-ring",
    title: "Even, keyboard-only row rings",
    description:
      "Row focus rings appear only after keyboard focus and draw the same width on all four edges, above pinned cells.",
    date: "2026-11-07",
    commit: "73aa450373",
    page: "table"
  },
  {
    id: "row-context-menu",
    title: "Right-click row actions",
    description:
      "Right-click a row, or press Shift+F10, to open the same actions as its More menu.",
    date: "2026-11-07",
    commit: "a7c26c60b7",
    page: "table"
  },
  {
    id: "toggle-on",
    title: "Toggles show their selection",
    description:
      "A toggle wrapped in a tooltip shows its selected item again, with the same indicator as segmented Tabs.",
    date: "2026-11-07",
    commit: "82f79f402f",
    page: "toggle-group"
  },
  {
    id: "secret-input-rowlink",
    title: "Quiet secret inputs and row chevrons",
    description:
      "Secret value fields use the UI sans and the same muted placeholder as Input, and navigable rows end in a chevron.",
    date: "2026-11-07",
    commit: "c47e88f745",
    page: "row-link"
  },
  {
    id: "trigger-layout",
    title: "Start-aligned triggers",
    description:
      'Picker triggers put the value at the start and the chevron at the end, matching Select, with layout="trigger" on Button.',
    date: "2026-11-07",
    commit: "357f910288",
    page: "button"
  },
  {
    id: "header-band",
    title: "Header band and quiet empty rows",
    description:
      "Table headers keep one band edge to edge again, and empty, loading and group rows no longer light up on hover.",
    date: "2026-11-07",
    commit: "c23123067c",
    page: "table"
  },
  {
    id: "mix-ink",
    title: "Softer states and mix ink",
    description:
      "Hover, current and selected are about a third softer, and peach mixes them from a warm ink so they blend into its ground.",
    date: "2026-11-07",
    commit: "1a59816ab6",
    page: "palette"
  },
  {
    id: "current-selected-mix",
    title: "Softer current and selected",
    description:
      "The current sidebar item and dark selected rows sit just past hover, tuned by current-mix and selected-mix in the palette playground.",
    date: "2026-11-07",
    commit: "c58b6c81ec",
    page: "palette"
  },
  {
    id: "pinned-cells",
    title: "Pinned cells match their row",
    description:
      "Pinned columns now paint exactly the row's color at rest, on hover, selected and expanded, and scrolled tables keep their actions tail.",
    date: "2026-11-07",
    commit: "4cf899bbbe",
    page: "table"
  },
  {
    id: "palette-playground",
    title: "Palette playground",
    description:
      "Tune any theme token live on a sample shell, share the view by link and copy the overrides as tokens.json.",
    date: "2026-11-07",
    commit: "d054fdfef6",
    page: "palette"
  },
  {
    id: "card-pairs",
    title: "Bands, xs Input and flush SettingsCard",
    description:
      "Framed band labels sit at one height, Input gains a 24px xs size, and a flush SettingsCard embeds a table.",
    date: "2026-11-07",
    commit: "45ad1c70c1",
    page: "settings-card"
  }
];
