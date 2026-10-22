import { useMemo, useState } from "react";

import { Identity } from "@app/components/v4/ui/avatar";
import { Badge, type BadgeTone } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Media } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Meta } from "@app/components/v4/ui/text";

import { Shell, useCrumbs } from "./shared";

type Status = "unresolved" | "resolved" | "false-positive" | "ignored";
type Finding = {
  id: string;
  source: string;
  repo: string;
  file: string;
  line: number;
  rule: string;
  author: string;
  commit: string;
  detected: string;
  status: Status;
};

const statuses: { value: Status; label: string; tone: BadgeTone; action: string }[] = [
  { value: "unresolved", label: "Unresolved", tone: "warn", action: "Reopen" },
  { value: "resolved", label: "Resolved", tone: "ok", action: "Mark resolved" },
  { value: "false-positive", label: "False positive", tone: "soft", action: "Mark false positive" },
  { value: "ignored", label: "Ignored", tone: "outline", action: "Ignore" }
];
const statusOf = (value: Status) => statuses.find((item) => item.value === value) ?? statuses[0];

const dataSources = [
  {
    id: "acme-corp",
    name: "acme-corp",
    repos: [
      "acme-corp/payments-api",
      "acme-corp/web-dashboard",
      "acme-corp/platform-core",
      "acme-corp/infra-terraform"
    ]
  },
  {
    id: "acme-labs",
    name: "acme-labs",
    repos: ["acme-labs/ml-pipelines", "acme-labs/checkout-prototype"]
  },
  { id: "acme-oss", name: "acme-oss", repos: ["acme-oss/acme-cli", "acme-oss/helm-charts"] }
];
const sourceOf = (repo: string) => repo.split("/")[0];

const open: Omit<Finding, "id" | "source" | "status">[] = [
  {
    repo: "acme-corp/payments-api",
    file: "src/billing/stripe-client.ts",
    line: 14,
    rule: "stripe-access-token",
    author: "Marcus Webb",
    commit: "3f9c2ab",
    detected: "12m ago"
  },
  {
    repo: "acme-corp/payments-api",
    file: ".env.example",
    line: 7,
    rule: "generic-api-key",
    author: "Priya Raman",
    commit: "b81e04d",
    detected: "2h ago"
  },
  {
    repo: "acme-corp/infra-terraform",
    file: "modules/rds/main.tf",
    line: 42,
    rule: "aws-access-token",
    author: "Tom Becker",
    commit: "9a6d1f0",
    detected: "5h ago"
  },
  {
    repo: "acme-corp/web-dashboard",
    file: ".github/workflows/deploy.yml",
    line: 27,
    rule: "github-pat",
    author: "Diego Alvarez",
    commit: "e2c7a95",
    detected: "8h ago"
  },
  {
    repo: "acme-corp/platform-core",
    file: "k8s/overlays/prod/secret.yaml",
    line: 11,
    rule: "private-key",
    author: "Hana Kim",
    commit: "41bb3c8",
    detected: "1d ago"
  },
  {
    repo: "acme-labs/ml-pipelines",
    file: "notebooks/feature-store/load_events.ipynb",
    line: 118,
    rule: "gcp-api-key",
    author: "Lena Novak",
    commit: "c03f9e2",
    detected: "1d ago"
  },
  {
    repo: "acme-corp/web-dashboard",
    file: "src/lib/notifications/slack.ts",
    line: 9,
    rule: "slack-webhook-url",
    author: "Diego Alvarez",
    commit: "7d2e6b1",
    detected: "2d ago"
  },
  {
    repo: "acme-oss/acme-cli",
    file: "internal/auth/testdata/token.json",
    line: 3,
    rule: "jwt",
    author: "Sarah Lin",
    commit: "f5a1c47",
    detected: "2d ago"
  },
  {
    repo: "acme-corp/payments-api",
    file: "scripts/seed-customers.py",
    line: 8,
    rule: "sendgrid-api-token",
    author: "Priya Raman",
    commit: "2b9f8d3",
    detected: "3d ago"
  },
  {
    repo: "acme-labs/checkout-prototype",
    file: "server/config.js",
    line: 22,
    rule: "stripe-access-token",
    author: "Marcus Webb",
    commit: "aa40e6c",
    detected: "4d ago"
  },
  {
    repo: "acme-corp/platform-core",
    file: "deploy/helm/values-staging.yaml",
    line: 64,
    rule: "twilio-api-key",
    author: "Tom Becker",
    commit: "5c71b0a",
    detected: "5d ago"
  },
  {
    repo: "acme-oss/helm-charts",
    file: "charts/agent/values.yaml",
    line: 31,
    rule: "generic-api-key",
    author: "Hana Kim",
    commit: "d9e3a28",
    detected: "6d ago"
  },
  {
    repo: "acme-corp/infra-terraform",
    file: "environments/prod/backend.tf",
    line: 5,
    rule: "aws-access-token",
    author: "Tom Becker",
    commit: "08fd4b7",
    detected: "1w ago"
  },
  {
    repo: "acme-corp/web-dashboard",
    file: "cypress/fixtures/session.json",
    line: 2,
    rule: "jwt",
    author: "Lena Novak",
    commit: "6e2a9d1",
    detected: "2w ago"
  }
];
const rules = [
  "generic-api-key",
  "aws-access-token",
  "github-pat",
  "stripe-access-token",
  "private-key",
  "jwt"
];
const authors = [
  "Sarah Lin",
  "Marcus Webb",
  "Priya Raman",
  "Diego Alvarez",
  "Hana Kim",
  "Tom Becker",
  "Lena Novak"
];
const files = [
  "README.md",
  "config/default.json",
  "docker-compose.yml",
  "src/index.ts",
  "tests/fixtures/env.json",
  "Makefile"
];
const allRepos = dataSources.flatMap((source) => source.repos);
const closed: Finding[] = Array.from({ length: 37 }, (_, index) => {
  const repo = allRepos[(index * 5) % allRepos.length];
  return {
    id: `closed-${index}`,
    source: sourceOf(repo),
    repo,
    file: files[index % files.length],
    line: 3 + ((index * 17) % 90),
    rule: rules[(index * 7) % rules.length],
    author: authors[(index * 3) % authors.length],
    commit: ((index + 11) * 2654435761).toString(16).slice(-7),
    detected: `${2 + Math.floor(index / 3)}w ago`,
    status: (["resolved", "false-positive", "ignored"] as const)[
      (index >= 29 ? 1 : 0) + (index >= 35 ? 1 : 0)
    ]
  };
});
const initialFindings: Finding[] = [
  ...open.map((finding, index) => ({
    ...finding,
    id: `open-${index}`,
    source: sourceOf(finding.repo),
    status: "unresolved" as const
  })),
  ...closed
];

const fingerprintOf = (finding: Finding) =>
  `${finding.commit}:${finding.file}:${finding.rule}:${finding.line}`;
const pageSize = 20;

export default function SecretScanning() {
  const { org, product } = useCrumbs({ product: "scanning" });
  const [findings, setFindings] = useState(initialFindings);
  const [status, setStatus] = useState<Status | "all">("unresolved");
  const [source, setSource] = useState("all");
  const [repo, setRepo] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const scoped = findings.filter(
    (finding) =>
      (source === "all" || finding.source === source) && (repo === "all" || finding.repo === repo)
  );
  const rows = scoped.filter((finding) => status === "all" || finding.status === status);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const count = (value: Status) => scoped.filter((finding) => finding.status === value).length;
  const openFinding = findings.find((finding) => finding.id === opened);
  const repoOptions = useMemo(
    () => [
      { value: "all", label: "All repositories" },
      ...(dataSources.find((item) => item.id === source)?.repos ?? []).map((value) => ({
        value,
        label: value
      }))
    ],
    [source]
  );

  const setStatusFor = (ids: readonly string[], next: Status) => {
    setFindings((current) =>
      current.map((finding) => (ids.includes(finding.id) ? { ...finding, status: next } : finding))
    );
    setSelected([]);
    setNotice(
      `${ids.length} ${ids.length === 1 ? "finding" : "findings"} set to ${statusOf(next).label.toLowerCase()}`
    );
  };
  const refilter = (change: () => void) => {
    change();
    setPage(1);
    setSelected([]);
  };

  const columns: DataTableColumn<Finding>[] = [
    {
      id: "repo",
      header: "Repository",
      primary: true,
      width: 340,
      maxWidth: 340,
      text: (row) => `${row.repo} ${row.file}:${row.line}`,
      render: (row) => (
        <Inline gap={12} align="center" wrap={false}>
          <Media icon="git" size="sm" />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <code>{row.repo}</code>
            <Meta style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.file}:{row.line}
            </Meta>
          </Stack>
        </Inline>
      )
    },
    { id: "rule", header: "Rule", width: 184, render: (row) => <code>{row.rule}</code> },
    {
      id: "author",
      header: "Author",
      grow: true,
      text: (row) => row.author,
      render: (row) => <Identity name={row.author} />
    },
    { id: "commit", header: "Commit", width: 96, render: (row) => <Meta>{row.commit}</Meta> },
    {
      id: "detected",
      header: "Detected",
      width: 96,
      render: (row) => <Meta mono={false}>{row.detected}</Meta>
    },
    {
      id: "status",
      header: "Status",
      width: 136,
      render: (row) => <Badge tone={statusOf(row.status).tone}>{statusOf(row.status).label}</Badge>
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      hideHeader: true,
      render: (row) => (
        <Inline gap={4} align="center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
                {`Status actions for ${row.rule} in ${row.repo}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Set status</DropdownMenuLabel>
              {statuses
                .filter((item) => item.value !== row.status)
                .map((item) => (
                  <DropdownMenuItem
                    key={item.value}
                    onSelect={() => setStatusFor([row.id], item.value)}
                  >
                    {item.action}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setOpened(row.id)}>View details</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            icon="chev-right"
            iconOnly
            onClick={() => setOpened(row.id)}
          >
            {`Open ${row.rule} in ${row.repo}`}
          </Button>
        </Inline>
      )
    }
  ];

  const statusLabel = status === "all" ? "" : `${statusOf(status).label.toLowerCase()} `;
  const scopeLabel = [repo, source].find((value) => value !== "all") ?? "";
  const filtered = status !== "all" || source !== "all";

  return (
    <Shell
      level="scanning"
      product="scanning"
      current="findings"
      crumbs={[org, product, { label: "Findings" }]}
    >
      <Stack gap={24}>
        <PageHeader
          title="Findings"
          description="Secrets detected across every data source. Review and triage leaked secrets."
          tabs={
            <Tabs
              label="Finding status"
              value={status}
              onChange={(value) => refilter(() => setStatus(value as Status | "all"))}
              tabs={[
                ...statuses.map((item) => ({
                  value: item.value,
                  label: item.label,
                  count: count(item.value),
                  content: null
                })),
                { value: "all", label: "All", count: scoped.length, content: null }
              ]}
            />
          }
        />
        <Inline gap={8} align="center">
          <div style={{ width: 240 }}>
            <Select
              aria-label="Data source"
              options={[
                { value: "all", label: "All data sources" },
                ...dataSources.map((item) => ({
                  value: item.id,
                  label: item.name,
                  description: `GitHub, ${item.repos.length} repositories`
                }))
              ]}
              value={source}
              onChange={(value) =>
                refilter(() => {
                  setSource(value);
                  setRepo("all");
                })
              }
            />
          </div>
          <div style={{ width: 280 }}>
            <Select
              aria-label="Repository"
              options={repoOptions}
              value={repo}
              disabled={source === "all"}
              onChange={(value) => refilter(() => setRepo(value))}
            />
          </div>
          <Meta mono={false} role="status">
            {notice || (source === "all" ? "Choose a data source to filter by repository" : "")}
          </Meta>
        </Inline>
        <Stack gap={12}>
          <DataTable
            label={`${statusLabel}findings`}
            rows={pageRows}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => `${row.rule} in ${row.repo}`}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            footer={
              rows.length > pageSize
                ? undefined
                : `${rows.length} ${statusLabel}${rows.length === 1 ? "finding" : "findings"}${scopeLabel ? ` in ${scopeLabel}` : " across 3 data sources"}`
            }
            empty={
              <EmptyState
                size="sm"
                media="bare"
                icon="check-c"
                title={
                  filtered
                    ? `No ${statusLabel}findings${scopeLabel ? ` in ${scopeLabel}` : ""}`
                    : "No secret leaks found"
                }
                description={
                  filtered ? undefined : "Findings appear here when a scan detects a secret."
                }
                actions={
                  status !== "all" ? (
                    <Button variant="outline" onClick={() => refilter(() => setStatus("all"))}>
                      Show all statuses
                    </Button>
                  ) : undefined
                }
              />
            }
          />
          {rows.length > pageSize && (
            <Pagination
              label="Findings pages"
              page={page}
              onPageChange={(next) => {
                setPage(next);
                setSelected([]);
              }}
              total={rows.length}
              pageSize={pageSize}
            />
          )}
        </Stack>
      </Stack>
      <FloatingActionBar
        count={selected.length}
        total={pageRows.length}
        onSelectAll={() => setSelected(pageRows.map((row) => row.id))}
        onClear={() => setSelected([])}
        noun={selected.length === 1 ? "finding" : "findings"}
        actions={[
          {
            label: "Mark resolved",
            icon: "check-c",
            onClick: () => setStatusFor(selected, "resolved")
          },
          {
            label: "False positive",
            icon: "x",
            onClick: () => setStatusFor(selected, "false-positive")
          }
        ]}
        moreActions={[
          { label: "Ignore", onClick: () => setStatusFor(selected, "ignored") },
          { label: "Reopen", onClick: () => setStatusFor(selected, "unresolved") }
        ]}
      />
      <Sheet open={Boolean(openFinding)} onOpenChange={(next) => !next && setOpened(null)}>
        <SheetContent>
          {openFinding && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <code>{openFinding.rule}</code>
                </SheetTitle>
                <SheetDescription>
                  Detected {openFinding.detected} in {openFinding.repo}
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <DataList
                  variant="props"
                  items={[
                    [
                      "Status",
                      <Badge key="status" tone={statusOf(openFinding.status).tone}>
                        {statusOf(openFinding.status).label}
                      </Badge>
                    ],
                    [
                      "File",
                      <code key="file">
                        {openFinding.file}:{openFinding.line}
                      </code>
                    ],
                    ["Commit", <Meta key="commit">{openFinding.commit}</Meta>],
                    ["Author", <Identity key="author" name={openFinding.author} />],
                    ["Data source", `${openFinding.source} on GitHub`],
                    ["Fingerprint", <Meta key="fingerprint">{fingerprintOf(openFinding)}</Meta>]
                  ]}
                />
              </SheetBody>
              <SheetFooter>
                {openFinding.status === "unresolved" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setStatusFor([openFinding.id], "false-positive")}
                    >
                      Mark false positive
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => setStatusFor([openFinding.id], "resolved")}
                    >
                      Mark resolved
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setStatusFor([openFinding.id], "unresolved")}
                  >
                    Reopen
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Shell>
  );
}
