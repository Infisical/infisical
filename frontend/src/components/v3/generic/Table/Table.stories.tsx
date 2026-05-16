import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BoxIcon as ProjectIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  EditIcon,
  MoreHorizontalIcon,
  TrashIcon
} from "lucide-react";

import {
  Badge,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Pagination
} from "@app/components/v3/generic";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "./Table";

type Identity = {
  name: string;
  role: string;
  managedBy?: { scope: "org" | "namespace"; name: string };
};

const identities: Identity[] = [
  {
    name: "machine-one",
    role: "Admin",
    managedBy: { scope: "org", name: "infisical" }
  },
  {
    name: "machine-two",
    role: "Viewer",
    managedBy: { scope: "namespace", name: "engineering" }
  },
  { name: "machine-three", role: "Member" },
  {
    name: "machine-four",
    role: "Admin",
    managedBy: { scope: "namespace", name: "dev-ops" }
  },
  {
    name: "machine-five",
    role: "Viewer",
    managedBy: { scope: "org", name: "infisical" }
  },
  { name: "machine-six", role: "Member" }
];

/**
 * `Table` is the v3 data-table primitive — native `<table>` markup wrapped in a
 * bordered, scrollable container. Compose it from `Table` (root) → `TableHeader`
 * (with one `TableRow` of `TableHead`s) → `TableBody` (with one `TableRow` of
 * `TableCell`s per data row), plus optional `TableFooter` for summary rows and
 * `TableCaption` for an accessible description.
 *
 * **Always render a `Table` inside a `Card`, `Dialog`, or `Sheet`.** Tables sit
 * on a chrome surface, never bare on the page background — that's how a
 * settings section, a modal flow, or a slide-over panel reads as a contained
 * unit. (The stories below render the table on its own purely so the component
 * is the focus.)
 *
 * **For the empty case, use the `Empty` component above the table** (set
 * `className="border"` to activate its dashed frame). Don't render an empty
 * `Table` with a "No rows" cell — `Empty` is the v3-sanctioned empty state with
 * icon, title, description, and call-to-action slots.
 *
 * Reach for `Table` for tabular data with a known schema — members, identities,
 * audit logs, secret diffs, integration runs. For long lists with no grid
 * structure, a `<ul>` of `Item`s is usually a better fit.
 *
 * Useful per-cell flags:
 * - **`isTruncatable`** on `TableHead` / `TableCell` clips long content with
 *   ellipsis instead of letting the column blow out the row width.
 * - **`data-state="selected"`** on a `TableRow` paints the selected highlight
 *   for row-checkbox patterns.
 * - A `TableHead` with a child icon flips to a sortable look — clickable
 *   cursor and inline icon — without any extra wiring.
 *
 * For datasets that don't fit on a single screen, pair the `Table` with the
 * `Pagination` component as a sibling below it — see *Example: With
 * Pagination*.
 */
const meta = {
  title: "Generic/Table",
  component: Table,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[760px]">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Anatomy: Default",
  parameters: {
    docs: {
      description: {
        story:
          "The baseline — `Table` wraps a `TableHeader` (one row of `TableHead`s) and a `TableBody` (one `TableRow` per data row). The bordered container and horizontal scroll behavior are built in, so a bare table is already a finished surface."
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.slice(0, 4).map((id) => (
          <TableRow key={id.name}>
            <TableCell className="font-medium">{id.name}</TableCell>
            <TableCell>{id.role}</TableCell>
            <TableCell>
              <Badge variant="success">Active</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};

export const WithCaption: Story = {
  name: "Anatomy: With Caption",
  parameters: {
    docs: {
      description: {
        story:
          "`TableCaption` renders a screen-reader-accessible description below the table. Use it whenever the table needs context that isn't carried by the column headers — what the rows represent, the time window, the filter that produced them."
      }
    }
  },
  render: () => (
    <Table>
      <TableCaption>Identities created in the last 30 days.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.slice(0, 3).map((id) => (
          <TableRow key={id.name}>
            <TableCell className="font-medium">{id.name}</TableCell>
            <TableCell>{id.role}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};

export const WithFooter: Story = {
  name: "Anatomy: With Footer",
  parameters: {
    docs: {
      description: {
        story:
          "`TableFooter` renders a summary row (totals, counts, aggregates) below the body, separated by its own top border. Use a single `TableRow` inside; `colSpan` whatever cells you want to merge for the summary label."
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Active secrets</TableHead>
          <TableHead className="text-right">Reads (30d)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          { name: "infra", secrets: 142, reads: 18430 },
          { name: "api", secrets: 87, reads: 9622 },
          { name: "frontend", secrets: 24, reads: 3014 }
        ].map((p) => (
          <TableRow key={p.name}>
            <TableCell className="font-medium">{p.name}</TableCell>
            <TableCell>{p.secrets}</TableCell>
            <TableCell className="text-right">{p.reads.toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-medium">Total</TableCell>
          <TableCell>253</TableCell>
          <TableCell className="text-right">31,066</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
};

export const WithSelection: Story = {
  name: "Example: With Selection",
  parameters: {
    docs: {
      description: {
        story:
          'Set `data-state="selected"` on a `TableRow` to paint the selected highlight — the same hover background, but persistent. Combine with a leading `Checkbox` cell for a row-selection pattern (bulk edit, bulk delete).'
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Managed by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.slice(0, 4).map((id, i) => (
          <TableRow key={id.name} data-state={i === 1 ? "selected" : undefined}>
            <TableCell>
              <Checkbox isChecked={i === 1} aria-label={`Select ${id.name}`} />
            </TableCell>
            <TableCell className="font-medium">{id.name}</TableCell>
            <TableCell>{id.role}</TableCell>
            <TableCell>{id.managedBy?.name ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};

export const SortableHeaders: Story = {
  name: "Example: Sortable Headers",
  parameters: {
    docs: {
      description: {
        story:
          "Drop a sort-indicator icon as a child of `TableHead` and the cell automatically picks up a clickable cursor and an inline icon slot. Wire `onClick` to your sort handler; rotate or fade the icon to reflect the active column and direction."
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead onClick={() => {}}>
            Name
            <ChevronDownIcon />
          </TableHead>
          <TableHead onClick={() => {}}>
            Role
            <ChevronsUpDownIcon className="opacity-30" />
          </TableHead>
          <TableHead onClick={() => {}}>
            Managed by
            <ChevronsUpDownIcon className="opacity-30" />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.slice(0, 4).map((id) => (
          <TableRow key={id.name}>
            <TableCell className="font-medium">{id.name}</TableCell>
            <TableCell>{id.role}</TableCell>
            <TableCell>{id.managedBy?.name ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};

export const TruncatedCells: Story = {
  name: "Example: Truncated Cells",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `isTruncatable` to `TableHead` and `TableCell` for any column that can carry long, single-line content (descriptions, paths, signatures). The column collapses to whatever space the row gives it, with the overflow clipped behind an ellipsis. Pair with the cell's `title` attribute so the full value is hover-discoverable."
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Identity</TableHead>
          <TableHead isTruncatable>Description</TableHead>
          <TableHead className="w-28">Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[
          {
            name: "machine-one",
            description:
              "Long-running CI worker in the infrastructure project, used by automation jobs that publish release artefacts to internal mirrors.",
            role: "Admin"
          },
          {
            name: "machine-two",
            description:
              "Service identity for the engineering namespace's secret rotation job; rotates every Sunday at 02:00 UTC.",
            role: "Viewer"
          },
          {
            name: "machine-three",
            description: "Standby identity reserved for incident response — do not delete.",
            role: "Member"
          }
        ].map((id) => (
          <TableRow key={id.name}>
            <TableCell className="font-medium">{id.name}</TableCell>
            <TableCell isTruncatable title={id.description}>
              {id.description}
            </TableCell>
            <TableCell>{id.role}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};

export const WithActions: Story = {
  name: "Example: With Actions",
  parameters: {
    docs: {
      description: {
        story:
          "Trailing `DropdownMenu` triggered by an `IconButton` is the canonical row-action pattern. Place the action cell at the right of the row (header empty, cell right-aligned) so the kebab sits on the trailing edge regardless of column widths."
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="w-12 text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.slice(0, 4).map((id) => (
          <TableRow key={id.name}>
            <TableCell className="font-medium">{id.name}</TableCell>
            <TableCell>{id.role}</TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" size="xs" aria-label={`${id.name} actions`}>
                    <MoreHorizontalIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem>
                    <CopyIcon />
                    Copy ID
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <EditIcon />
                    Edit identity
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="danger">
                    <TrashIcon />
                    Delete identity
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};

function PaginationRender() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const TOTAL = 142;

  const start = (page - 1) * perPage;
  const rowCount = Math.min(perPage, TOTAL - start);
  const roleFor = (idx: number) => {
    if (idx % 5 === 0) return "Admin";
    if (idx % 3 === 0) return "Viewer";
    return "Member";
  };
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const idx = start + i + 1;
    return { name: `machine-${String(idx).padStart(3, "0")}`, role: roleFor(idx) };
  });

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Name</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>{row.role}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        count={TOTAL}
        page={page}
        perPage={perPage}
        onChangePage={setPage}
        onChangePerPage={(next) => {
          setPerPage(next);
          setPage(1);
        }}
      />
    </>
  );
}

export const WithPagination: Story = {
  name: "Example: With Pagination",
  parameters: {
    docs: {
      description: {
        story:
          "Render `Pagination` as a sibling directly below the `Table`. The component handles the page / per-page controls and emits `onChangePage` / `onChangePerPage` — you supply the `count` of total rows and slice the dataset before rendering. This is the canonical pattern for any list that doesn't fit on a single screen."
      }
    }
  },
  render: () => <PaginationRender />
};

export const KitchenSink: Story = {
  name: "Example: Kitchen Sink",
  parameters: {
    docs: {
      description: {
        story:
          "A realistic identities table — a status `Badge`, a managed-by `Badge` with a `ProjectIcon`, and per-row actions in a trailing `DropdownMenu`. The composition you reach for on most management screens."
      }
    }
  },
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">Name</TableHead>
          <TableHead className="w-1/3">Role</TableHead>
          <TableHead className="w-1/3">Managed By</TableHead>
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {identities.map((id) => (
          <TableRow key={id.name}>
            <TableCell className="font-medium">{id.name}</TableCell>
            <TableCell>{id.role}</TableCell>
            <TableCell>
              <Badge variant="project">
                <ProjectIcon />
                Project
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" size="xs" aria-label={`${id.name} actions`}>
                    <MoreHorizontalIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem>
                    <CopyIcon />
                    Copy ID
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <EditIcon />
                    Edit Identity
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="danger">
                    <TrashIcon />
                    Delete Identity
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
};
