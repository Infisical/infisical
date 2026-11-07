import { describe, expect, it } from "vitest";

import {
  compareToBaseline,
  readBaseline,
  scanSource,
  scanTree,
  v4Checks
} from "../../../scripts/check-v4";
import sharedRules from "./skills/infisical-ui/rules.json";

const ui = "src/components/v4/ui/sample.tsx";
const css = "src/components/v4/ui/sample.module.css";
const example = "src/pages/design-system/examples/sample/default.tsx";
const page = "src/pages/v4/sample/page.tsx";

const checksIn = (file: string, text: string) =>
  scanSource(file, text).map((finding) => finding.check);

const cases: Record<string, { bad: [string, string][]; good: [string, string][] }> = {
  "raw-color": {
    bad: [
      [css, ".face { color: #fbfbf9; }"],
      [css, ".face { background: rgba(0, 0, 0, 0.1); }"],
      [ui, '<div className="bg-black/10 text-zinc-500" />']
    ],
    good: [
      [css, ".face { color: var(--v4-ink); }"],
      [ui, '<div className="bg-background text-muted-foreground" />'],
      [ui, '<a href="#colors">Colors</a>']
    ]
  },
  "bare-border": {
    bad: [
      [ui, '<div className="flex items-center rounded-lg border" />'],
      [ui, 'cn("-mx-4 border-t bg-muted/50", className)'],
      [ui, '<tr className="data-[state=open]:border-b p-2" />'],
      [ui, '<div className="border-2 p-2" />'],
      [ui, '<div className="border-l-4 bg-muted" />'],
      [ui, '<div className="border-[1.5px] border-dashed" />'],
      [ui, '<div className="!border p-2" />'],
      [ui, '<div className="focus:border-input border" />'],
      [
        ui,
        'cn(\n  "has-[>[data-slot=field]]:border has-data-[state=checked]:border-[color:var(--v4-ink)]"\n)'
      ],
      [ui, 'const item = cva("rounded-lg", { variants: { tone: { plain: "border" } } });'],
      [ui, 'cn("shrink-0", { "w-0 border-[1.5px]": dashed })']
    ],
    good: [
      [ui, '<div className="rounded-lg border border-[color:var(--v4-line)]" />'],
      [ui, '<div className="border-t border-t-transparent" />'],
      [ui, '<div className="border-input border" />'],
      [ui, '<div className="border-b-0" />'],
      [ui, '<div className="border-2 border-(--color-border)" />'],
      [ui, '<div className="focus:border focus:border-input" />'],
      [ui, 'const hint = "remove border";'],
      [ui, "<p>Use a border only when the panel needs one.</p>"],
      [ui, 'label("Add a border around unrelated actions.")']
    ]
  },
  "decorative-effect": {
    bad: [
      [ui, '<div className="shadow-md" />'],
      [ui, '<div className="backdrop-blur-xs" />'],
      [css, ".scrim { backdrop-filter: blur(4px); }"]
    ],
    good: [[ui, '<div className="shadow-pop" />']]
  },
  "transition-all": {
    bad: [
      [ui, '<button className="transition-all" />'],
      [css, ".row { transition: all 120ms; }"]
    ],
    good: [[ui, '<button className="transition-colors" />']]
  },
  "motion-literal": {
    bad: [
      [css, ".row { transition: height 200ms cubic-bezier(0.2, 0, 0, 1); }"],
      [css, ".glow { transition: box-shadow var(--v4-duration-moderate) ease-in-out; }"],
      [css, "    width 180ms,"],
      [css, ".dot { animation-delay: -0.6s; }"],
      [ui, '<div className="transition-colors duration-200 ease-out" />'],
      [ui, '<div className="delay-150" />'],
      [ui, '<div className="ease-[cubic-bezier(0.22,1,0.36,1)]" />'],
      [ui, '<div style={{ transition: "opacity 150ms" }} />'],
      [ui, '<div className="duration-[250ms] delay-[40ms]" />'],
      [ui, '<div style={{ transitionTimingFunction: "linear" }} />'],
      [css, ".v4 { --tw-duration: 150ms; }"]
    ],
    good: [
      [css, ".row { transition: height var(--v4-duration-moderate) var(--v4-ease-standard); }"],
      [css, ".row { transition-duration: 0ms; }"],
      [css, ".inner { transition: overflow 0s var(--v4-duration-moderate); }"],
      [css, ".face { background-image: linear-gradient(180deg, var(--v4-a), var(--v4-b)); }"],
      [css, ".bar { animation: none; }"],
      [ui, '<div className="duration-(--v4-duration-fast) ease-(--v4-ease-fade)" />'],
      [ui, '<div style={{ transitionDuration: "0ms" }} />'],
      [ui, '<div style={{ transitionTimingFunction: "var(--v4-ease-fade)" }} />']
    ]
  },
  "arbitrary-geometry": {
    bad: [
      [ui, '<div className="max-w-[440px]" />'],
      [example, '<div className="rounded-[10px] px-[13px]" />']
    ],
    good: [
      [ui, '<div className="max-w-sm px-3" />'],
      [ui, '<div className="[&_svg]:size-4" />']
    ]
  },
  "icon-source": {
    bad: [[ui, 'import { XIcon } from "@radix-ui/react-icons";']],
    good: [
      [ui, 'import { Icon } from "./icon";'],
      [ui, 'import { XIcon } from "lucide-react";']
    ]
  },
  "overlay-section-padding": {
    bad: [["src/components/v4/v4.css", '.v4 [data-slot="dialog-footer"] { padding: 12px 16px; }']],
    good: [["src/components/v4/v4.css", '.v4 [data-slot="dialog-footer"] { padding: 16px; }']]
  },
  "press-transform": {
    bad: [["src/components/v4/ui/button-material.module.css", ".ink:active { translate: 0 1px; }"]],
    good: [["src/components/v4/v4.css", ".v4 :active > [data-press] { scale: 0.97; }"]]
  },
  "scroll-fade": {
    bad: [["src/components/v4/ui/data.module.css", ".list { overflow-y: auto; }"]],
    good: [
      ["src/components/v4/ui/data.module.css", ".list { overflow: hidden; }"],
      ["src/components/v4/ui/top-bar.module.css", ".inset { overflow: auto; }"]
    ]
  },
  "menu-row-margin": {
    bad: [["src/components/v4/ui/menu.module.css", ".separator { margin: 4px 0; }"]],
    good: [
      [
        "src/components/v4/ui/menu.module.css",
        ".separator { height: 7px; } .meta { margin-inline-start: auto; }"
      ]
    ]
  },
  "theme-name-branch": {
    bad: [
      [css, ':global(.v4[data-theme="dark"]) .row { color: var(--v4-ink); }'],
      [ui, '<div className="[[data-theme=light]_&]:hidden" />']
    ],
    good: [
      [css, ':global(.v4[data-scheme="dark"]) .row { color: var(--v4-ink); }'],
      [css, ".v4[data-theme-switching] * { transition: none; }"]
    ]
  },
  "line-on-edge": {
    bad: [
      [css, ".card { border: var(--v4-size-control-border) solid var(--v4-line); }"],
      [css, ".tile { border-color: var(--v4-line); }"],
      [ui, '<div className="border border-[color:var(--v4-line)] p-3" />']
    ],
    good: [
      [css, ".card { border: var(--v4-size-control-border) solid var(--v4-line-soft); }"],
      [css, ".rule { height: 1px; background: var(--v4-line); }"],
      [css, ".track { border-bottom: 1px solid var(--v4-line); }"],
      [ui, '<div className="border-t border-[color:var(--v4-line)]" />']
    ]
  },
  "left-accent-bar": {
    bad: [
      [css, ".row[data-pending] > td:first-child { box-shadow: inset 2px 0 0 var(--v4-ok-line); }"],
      [css, ".cell { box-shadow: inset var(--v4-size-control-border) 0 0 var(--v4-info-line); }"],
      [css, ".alert { border-left: 3px solid var(--v4-warn); }"],
      [css, ".item { border-inline-start: var(--v4-size-control-border) solid var(--v4-accent); }"],
      [ui, '<div className="border-l-2 border-l-[color:var(--v4-bad)]" />']
    ],
    good: [
      [css, ".tree { border-left: var(--v4-size-control-border) solid var(--v4-line-soft); }"],
      [css, ".pin { border-inline-start: 1px solid var(--v4-line); }"],
      [css, ".field { box-shadow: inset 0 0 0 var(--v4-size-control-border) var(--v4-line); }"],
      [css, ".row { background-image: linear-gradient(var(--tint), var(--tint)); }"]
    ]
  },
  "row-action-reveal": {
    bad: [
      [example, "<TableRowActions reveal>"],
      [example, "<TableRowIndicators swap>"],
      [css, '[data-slot="table-row"]:hover .tableRowActions { position: static; }'],
      [css, "tr:hover .actions { display: flex; }"],
      [css, ".row:is(:hover, :focus-within) .copy { width: auto; }"]
    ],
    good: [
      [example, "<TableActionsCell slots={2}>"],
      [css, ".row:hover { background: var(--v4-tint); }"],
      [css, ".row:hover .rowCheck { opacity: 1; }"],
      [css, ".button:hover { width: auto; }"]
    ]
  },
  "row-action-destructive-inline": {
    bad: [
      [example, 'inline: [{ label: "Delete token", icon: "trash", onSelect: remove }]'],
      [
        example,
        'inline: [\n  { label: "Edit", icon: "settings", onSelect: edit },\n  {\n    label: "Revoke access",\n    icon: UserXIcon,\n    onSelect: revoke\n  }\n]'
      ],
      [example, 'inline={[{ label: "Unassign from group", icon: "trash", onSelect: unassign }]}'],
      [
        example,
        'inline: [\n  {\n    label: (row) =>\n      row.managed ? "Delete identity" : "Remove from project",\n    onSelect: remove\n  }\n]'
      ]
    ],
    good: [
      [example, 'inline: [{ label: "Edit value", icon: "settings", onSelect: edit }]'],
      [
        example,
        'inline: [{ label: "Copy", icon: "copy", disabledReason: () => "Remove the lock first", onSelect: copy }]'
      ],
      [
        example,
        '<DropdownMenuItem variant="destructive">\n  <Icon name="trash" />\n  Delete token\n</DropdownMenuItem>'
      ],
      [example, 'const removed = { label: "Remove user", icon: "trash" };']
    ]
  },
  "nested-frame": {
    bad: [
      [
        example,
        '<Card variant="framed" title="Roles">\n  <List variant="framed" label="Roles">\n    {rows}\n  </List>\n</Card>'
      ],
      [
        example,
        '<Card variant="framed" title="Overview">\n  <Card title="Inner">\n    <Card variant={"framed"}>Nested</Card>\n  </Card>\n</Card>'
      ],
      [
        example,
        '<DataTable\n  rows={rows}\n  columns={[{ id: "a", cell: () => <Card variant="framed">x</Card> }]}\n/>'
      ],
      [
        example,
        '<List label="Queues">\n  <ApprovalQueue variant="framed" requests={requests} />\n</List>'
      ]
    ],
    good: [
      [
        example,
        '<Card variant="framed" title="Roles">\n  <DataTable rows={rows} columns={columns} />\n</Card>'
      ],
      [
        example,
        '<Card variant="framed" title="A">a</Card>\n<Card variant="framed" title="B">b</Card>'
      ],
      [
        example,
        '<List variant="plain" label="Plans">\n  <Card variant="framed">Plan</Card>\n</List>'
      ],
      [example, '<Card title="Summary">\n  <List variant="framed" label="Rows" />\n</Card>']
    ]
  },
  "interactive-tooltip": {
    bad: [
      [
        example,
        '<Tooltip content={<a href="/docs">Read the docs</a>}>\n  <Button>Help</Button>\n</Tooltip>'
      ],
      [
        example,
        "<Tooltip>\n  <TooltipTrigger asChild>\n    <Button>Key</Button>\n  </TooltipTrigger>\n  <TooltipContent>\n    <CopyButton value={id} />\n  </TooltipContent>\n</Tooltip>"
      ],
      [
        example,
        "<Tooltip\n  content={\n    <span onClick={() => setOpen(true)}>Details</span>\n  }\n>\n  <span>Status</span>\n</Tooltip>"
      ]
    ],
    good: [
      [example, '<Tooltip content="Export CSV">\n  <Button>Export</Button>\n</Tooltip>'],
      [example, "<Tooltip content={<code>{id}</code>}>\n  <a href={href}>Key</a>\n</Tooltip>"],
      [
        example,
        "<HoverCard>\n  <HoverCardTrigger asChild>\n    <Button>Key</Button>\n  </HoverCardTrigger>\n  <HoverCardContent>\n    <CopyButton value={id} />\n  </HoverCardContent>\n</HoverCard>"
      ]
    ]
  },
  "flat-hover": {
    bad: [
      [css, ".row:hover {\n  background: var(--v4-tint);\n}"],
      [css, ".tool:is(:hover, :focus-visible) {\n  background-color: var(--v4-line-soft);\n}"],
      [css, ".item:hover {\n  background: #eeeae3;\n}"]
    ],
    good: [
      [css, ".row:hover {\n  background: var(--v4-hover);\n}"],
      [css, ".row[data-current]:hover {\n  background: var(--v4-sidebar-current);\n}"],
      [css, ".row:not(:hover) > td {\n  background-color: var(--v4-surface);\n}"],
      [css, '.item[aria-pressed="true"]:hover {\n  background-color: var(--v4-pop);\n}'],
      [css, ".resize:hover::after {\n  background: var(--v4-control);\n}"]
    ]
  },
  "disabled-in-tooltip": {
    bad: [
      [
        example,
        '<Tooltip content="Export CSV">\n  <Button disabled={!rows.length}>Export</Button>\n</Tooltip>'
      ],
      [
        example,
        "<Tooltip content={reason}>\n  <span>\n    <Button\n      onClick={() => run(a > b)}\n      disabled\n    >\n      Run\n    </Button>\n  </span>\n</Tooltip>"
      ],
      [
        example,
        '<TooltipTrigger asChild>\n  <Button variant="outline" disabled={locked}>Edit</Button>\n</TooltipTrigger>'
      ]
    ],
    good: [
      [example, '<Button disabledReason="Only admins can export.">Export</Button>'],
      [
        example,
        '<Tooltip content={reason ? undefined : "Export CSV"}>\n  <Button disabledReason={reason}>Export</Button>\n</Tooltip>'
      ],
      [
        example,
        '<Tooltip content="Export CSV">\n  <Button onClick={run}>Export</Button>\n</Tooltip>'
      ],
      [example, '<Button disabled>Save</Button>\n<Tooltip content="Help" />']
    ]
  },
  "trigger-start-aligned": {
    bad: [
      [
        example,
        '<PopoverTrigger asChild>\n  <Button variant="outline" iconRight="chev-down" className="w-56">\n    Production\n  </Button>\n</PopoverTrigger>'
      ],
      [
        example,
        '<DropdownMenuTrigger asChild>\n  <Button variant="outline">\n    <span>{text}</span>\n    <Icon name="chev-down" />\n  </Button>\n</DropdownMenuTrigger>'
      ],
      [
        ui,
        '<PopoverTrigger asChild>\n  <Button variant="ghost">\n    Region\n    <ChevronDown />\n  </Button>\n</PopoverTrigger>'
      ]
    ],
    good: [
      [
        example,
        '<PopoverTrigger asChild>\n  <Button variant="outline" layout="trigger" className="w-56">\n    Production\n  </Button>\n</PopoverTrigger>'
      ],
      [
        example,
        '<DropdownMenuTrigger asChild>\n  <Button variant="ghost" size="icon-xs" icon="chev-down" iconOnly>\n    Expand\n  </Button>\n</DropdownMenuTrigger>'
      ],
      [
        example,
        '<PopoverTrigger asChild>\n  <Button variant="outline" icon="plus">Add</Button>\n</PopoverTrigger>'
      ],
      [example, '<Button variant="outline" iconRight="chev-right">Continue</Button>']
    ]
  },
  "dot-separator": {
    bad: [[example, "<span>Primary · alias of default</span>"]],
    good: [[example, "<span>Primary, alias of default</span>"]]
  },
  "slash-separator": {
    bad: [
      [ui, '<span className={styles.separator} aria-hidden="true">\n  /\n</span>'],
      [example, "<BreadcrumbSeparator>/</BreadcrumbSeparator>"],
      [css, '.separator::before { content: "/"; }']
    ],
    good: [
      [ui, "<BreadcrumbSeparator />"],
      [example, '<code>{"/billing/stripe"}</code>'],
      [example, "<span>matches any characters except <code>/</code></span>"],
      [example, 'const [path, setPath] = useState("/");']
    ]
  },
  "cursor-pointer": {
    bad: [
      [css, ".trigger { cursor: pointer; }"],
      [css, "a.title,\nbutton.title {\n  cursor: pointer;\n}"],
      [css, ".row:has(.badge) { cursor: pointer; }"],
      [ui, '<button className="cursor-pointer px-2" />'],
      [ui, 'cn("hover:cursor-pointer", className)'],
      [example, '<div style={{ cursor: "pointer" }} />']
    ],
    good: [
      [css, ".link { cursor: pointer; }"],
      [css, "a.title:hover { cursor: pointer; }"],
      [
        css,
        ':global(tr):has(> td a.stretched),\n:global([data-slot="card"]):has(a.stretched) {\n  cursor: pointer;\n}'
      ],
      [css, ".row { cursor: default; }"],
      [
        css,
        "/* v4-check-ignore cursor-pointer -- an unstyled text action that reads as a link */\n.action,\n.undo {\n  cursor: pointer;\n}"
      ],
      [ui, '<button className="cursor-default" />'],
      [ui, "<p>Only links take cursor: pointer.</p>"]
    ]
  },
  "suspense-fallback": {
    bad: [
      [example, '<Suspense fallback={<Spinner label="Loading secrets" />}>'],
      [example, '<Suspense fallback={<p role="status">Loading the v4 page</p>}>'],
      [example, "<Suspense fallback={null}>"]
    ],
    good: [
      [example, '<Suspense fallback={<Loader size="page" label="Loading secrets" />}>'],
      [example, "<Suspense fallback={<Skeleton lines={3} />}>"]
    ]
  },
  "row-activate-navigates": {
    bad: [
      [page, "<DataTable onRowActivate={(row) => go(links.member(row.id))} />"],
      [
        page,
        "const openMember = (row: Row) => navigate({ to: row.href });\n<DataTable onRowActivate={openMember} />"
      ],
      [
        example,
        "function open(id: string) {\n  router.navigate({ to: id });\n}\n<DataTable onRowActivate={(row) => open(row.id)} />"
      ]
    ],
    good: [
      [page, "<DataTable onRowActivate={(row) => setOpened(row)} />"],
      [page, "const edit = (row: Row) => setEditing(row.id);\n<DataTable onRowActivate={edit} />"],
      [ui, "<DataTable onRowActivate={(row) => go(row.href)} />"]
    ]
  },
  "pagination-outside-frame": {
    bad: [
      [page, "<Stack>\n  <DataTable rows={rows} />\n  {list.pagination}\n</Stack>"],
      [
        page,
        "<DataTable rows={rows} />\n{!isPending && total > 0 && (\n  <Pagination page={page} total={total} />\n)}"
      ],
      [
        example,
        "<DataTable\n  rows={rows}\n  pagination={<Pagination page={page} total={total} />}\n/>"
      ]
    ],
    good: [
      [
        page,
        '<DataTable\n  rows={rows}\n  pagination={total > 0 ? <Pagination variant="compact" page={page} total={total} /> : undefined}\n/>'
      ],
      [page, "<Grid>{cards}</Grid>\n{pagination}"],
      [page, "<DataTable rows={rows} />\n<Button>Load older</Button>"]
    ]
  },
  "row-actions-without-context-menu": {
    bad: [
      [
        page,
        "<TableRow>\n  <TableCell>{name}</TableCell>\n  <TableActionsCell>\n    <RowActions label={name} menu={menu} />\n  </TableActionsCell>\n</TableRow>"
      ],
      [
        example,
        "<RowContextMenu label={name} menu={menu}>\n  <TableRow />\n</RowContextMenu>\n<TableRow>\n  <TableActionsCell slots={1}>{open}</TableActionsCell>\n</TableRow>"
      ]
    ],
    good: [
      [
        page,
        "<RowContextMenu label={name} menu={menu}>\n  <TableRow>\n    <TableActionsCell>\n      <RowActions label={name} menu={menu} />\n    </TableActionsCell>\n  </TableRow>\n</RowContextMenu>"
      ],
      [
        page,
        "const row = (\n  <TableRow>\n    <TableActionsCell>\n      <RowActions label={name} />\n    </TableActionsCell>\n  </TableRow>\n);\nreturn <RowContextMenu label={name}>{row}</RowContextMenu>;"
      ],
      [
        page,
        "<TableHeader>\n  <TableRow>\n    <TableActionsHead>Actions</TableActionsHead>\n  </TableRow>\n</TableHeader>"
      ]
    ]
  },
  "raw-table-in-card": {
    bad: [
      [
        page,
        '<Card variant="framed" title="Reviewers">\n  <Table aria-label="Reviewers" />\n</Card>'
      ],
      [
        example,
        '<SettingsCard title="Contacts">\n  <Table aria-label="Contacts" />\n</SettingsCard>'
      ]
    ],
    good: [
      [
        page,
        '<Card variant="framed" title="Reviewers">\n  <DataTable label="Reviewers" />\n</Card>'
      ],
      [
        page,
        '<Card>\n  <Sheet>\n    <SheetContent>\n      <Table aria-label="Leases" />\n    </SheetContent>\n  </Sheet>\n</Card>'
      ],
      [
        "src/pages/v4/secret-manager/OverviewPage/OverviewPage.tsx",
        '<Card>\n  <Table aria-label="Secrets" />\n</Card>'
      ]
    ]
  },
  "fixed-bulk-bar": {
    bad: [
      [page, '<FloatingActionBar placement="fixed" count={2} onClear={clear} />'],
      [example, '<FloatingActionBar\n  count={2}\n  placement={"fixed"}\n  onClear={clear}\n/>']
    ],
    good: [
      [page, "<FloatingActionBar count={2} onClear={clear} />"],
      [page, '<FloatingActionBar placement="contained" count={2} onClear={clear} />'],
      [page, '<Popover placement="fixed" />']
    ]
  }
};

describe("v4 lint checks", () => {
  it("covers every check with fixtures", () => {
    expect(Object.keys(cases).sort()).toEqual(v4Checks.map((check) => check.id).sort());
  });

  Object.entries(cases).forEach(([id, { bad, good }]) => {
    it(`${id} flags its bad fixtures`, () => {
      bad.forEach(([file, text]) => expect(checksIn(file, text)).toContain(id));
    });
    it(`${id} passes its good fixtures`, () => {
      good.forEach(([file, text]) => expect(checksIn(file, text)).not.toContain(id));
    });
  });

  it("exempts a line under a v4-check-ignore marker that gives a reason", () => {
    const marked =
      "// v4-check-ignore raw-color -- matches a library attribute\n\"[stroke='#ccc']\"";
    const unexplained = "// v4-check-ignore raw-color\n\"[stroke='#ccc']\"";
    expect(checksIn(ui, marked)).not.toContain("raw-color");
    expect(checksIn(ui, unexplained)).toContain("raw-color");
  });

  it("finds nothing above the recorded baseline in the v4 tree", () => {
    const baseline = readBaseline();
    expect(baseline).toBeDefined();
    const { grown } = compareToBaseline(scanTree(), baseline ?? {});
    expect(grown.map((finding) => `${finding.file}:${finding.line} ${finding.check}`)).toEqual([]);
  });

  it("names a shared rule that names it back", () => {
    const linted = new Map(
      sharedRules.rules.flatMap((rule) =>
        rule.detect.by === "lint" && "check" in rule.detect ? [[rule.detect.check, rule.id]] : []
      )
    );
    v4Checks.forEach((check) => expect(linted.get(check.id)).toBe(check.rule));
  });
});
