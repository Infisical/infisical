import { useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";

import { Shell, useCrumbs } from "./shared";

type Usage = "encrypt" | "sign" | "mac";
type Key = {
  id: string;
  name: string;
  description: string;
  usage: Usage;
  algorithm: string;
  disabled?: boolean;
  version: number;
  created: string;
  exportable: boolean;
  deleteProtection?: boolean;
};

const seed: Key[] = [
  {
    id: "3f6c1a2e-8b4d-4e0f-9a7c-51d2e8b06f14",
    name: "backup-signing",
    description: "Nightly database backup archives",
    usage: "encrypt",
    algorithm: "AES-256-GCM",
    version: 1,
    created: "2026-04-07",
    exportable: true
  },
  {
    id: "9b2e47d0-1c5a-4f8e-b3d6-0a7e9c4f2b81",
    name: "billing-pii",
    description: "Cardholder data in the billing service",
    usage: "encrypt",
    algorithm: "AES-256-GCM",
    version: 4,
    created: "2025-11-03",
    exportable: false,
    deleteProtection: true
  },
  {
    id: "c41d8e06-7a3b-4b92-8f5e-2d6a0b9c7e33",
    name: "customer-exports",
    description: "Customer data export downloads",
    usage: "encrypt",
    algorithm: "AES-256-GCM",
    version: 2,
    created: "2026-02-18",
    exportable: true
  },
  {
    id: "5a0f93b7-2e6d-4c18-a4b0-8d3f1e7c6a59",
    name: "legacy-exports",
    description: "Replaced by customer-exports",
    usage: "encrypt",
    algorithm: "AES-128-GCM",
    disabled: true,
    version: 3,
    created: "2024-12-02",
    exportable: true
  },
  {
    id: "e7b3290c-4f1a-4d6e-9c85-3b0a7d2e1f46",
    name: "release-signing",
    description: "Signs CLI and agent release artifacts",
    usage: "sign",
    algorithm: "RSA-4096",
    version: 1,
    created: "2026-03-10",
    exportable: false,
    deleteProtection: true
  },
  {
    id: "1d8a6f25-9e0b-4a73-b2c4-6f5e8d1a0c97",
    name: "session-tokens",
    description: "Signs short-lived session tokens",
    usage: "sign",
    algorithm: "ECC-NISTP256",
    version: 1,
    created: "2026-08-30",
    exportable: true
  },
  {
    id: "82c5e0f9-3b7d-4e1a-8a6c-0f4b9d2e7a18",
    name: "webhook-hmac",
    description: "Authenticates outbound webhook payloads",
    usage: "mac",
    algorithm: "HMAC-SHA256",
    version: 1,
    created: "2026-05-21",
    exportable: true
  }
];

const usageLabel: Record<Usage, string> = {
  encrypt: "Encrypt and decrypt",
  sign: "Sign and verify",
  mac: "Generate and verify MAC"
};
const operations: Record<Usage, [string, string]> = {
  encrypt: ["Encrypt data", "Decrypt data"],
  sign: ["Sign data", "Verify data"],
  mac: ["Generate MAC", "Verify MAC"]
};
const usageOptions = [
  { value: "all", label: "All key usages" },
  ...(Object.keys(usageLabel) as Usage[]).map((value) => ({ value, label: usageLabel[value] }))
];

const KeyActions = ({
  item,
  onRotate,
  onToggle
}: {
  item: Key;
  onRotate: () => void;
  onToggle: () => void;
}) => {
  const off = item.disabled ? "Enable the key first" : undefined;
  let rotateBlock = off;
  if (item.usage !== "encrypt") rotateBlock = "Only encryption keys rotate";
  const exportBlock = item.exportable ? off : "Created as non-exportable";
  const deleteBlock = item.deleteProtection ? "Turn off delete protection first" : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
          {`Actions for ${item.name}`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={Boolean(off)} description={off}>
          <Icon name="lock" />
          {operations[item.usage][0]}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={Boolean(off)} description={off}>
          <Icon name="check-c" />
          {operations[item.usage][1]}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={Boolean(rotateBlock)}
          description={rotateBlock}
          onSelect={onRotate}
        >
          <Icon name="sync" />
          Rotate key
        </DropdownMenuItem>
        <DropdownMenuItem disabled={Boolean(exportBlock)} description={exportBlock}>
          <Icon name="download" />
          Export key
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Icon name="settings" />
          Edit key
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle}>
          <Icon name={item.disabled ? "check-c" : "x"} />
          {item.disabled ? "Enable key" : "Disable key"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(deleteBlock)}
          description={deleteBlock}
        >
          <Icon name="trash" />
          Delete key
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const CopyId = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Inline gap={4} align="center">
      <code>{`${id.slice(0, 8)}…`}</code>
      <Tooltip content={copied ? "Copied" : "Copy key ID"} side="top">
        <Button
          variant="ghost"
          size="icon-xs"
          icon={copied ? "check" : "copy"}
          iconOnly
          onClick={() => {
            navigator.clipboard?.writeText(id).catch(() => undefined);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          Copy key ID
        </Button>
      </Tooltip>
    </Inline>
  );
};

export default function Kms() {
  const { org, product, project } = useCrumbs({ product: "kms", project: "kms-keys" });
  const [keys, setKeys] = useState(seed);
  const [query, setQuery] = useState("");
  const [usage, setUsage] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "name",
    direction: "asc"
  });
  const update = (id: string, change: (item: Key) => Partial<Key>) =>
    setKeys((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change(item) } : item))
    );
  const needle = query.trim().toLowerCase();
  const rows = keys
    .filter((item) => !needle || item.name.includes(needle) || item.id.includes(needle))
    .filter((item) => usage === "all" || item.usage === usage)
    .sort((a, b) => a.name.localeCompare(b.name) * (sort.direction === "asc" ? 1 : -1));
  const eligible = (item: Key) => !item.disabled && item.exportable;
  const disabledCount = keys.filter((item) => item.disabled).length;
  const columns: DataTableColumn<Key>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (r) => `${r.name}: ${r.description}`,
      render: (r) => (
        <Inline gap={8} align="center" wrap={false}>
          {r.name}
          {!r.exportable && (
            <Tooltip content="Created as non-exportable" side="top">
              <span aria-label="Not exportable" role="img">
                <Icon name="lock" size={14} />
              </span>
            </Tooltip>
          )}
        </Inline>
      )
    },
    { id: "id", header: "Key ID", width: 140, render: (r) => <CopyId id={r.id} /> },
    { id: "usage", header: "Key usage", width: 172, render: (r) => usageLabel[r.usage] },
    { id: "algorithm", header: "Algorithm", width: 128, render: (r) => r.algorithm },
    {
      id: "status",
      header: "Status",
      width: 112,
      render: (r) =>
        r.disabled ? (
          <Badge tone="outline">Disabled</Badge>
        ) : (
          <Badge tone="ok" dot>
            Active
          </Badge>
        )
    },
    { id: "version", header: "Version", width: 72, render: (r) => `v${r.version}` },
    { id: "created", header: "Created", width: 104, render: (r) => r.created },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (r) => (
        <KeyActions
          item={r}
          onRotate={() => update(r.id, (item) => ({ version: item.version + 1 }))}
          onToggle={() => {
            update(r.id, (item) => ({ disabled: !item.disabled }));
            setSelected((current) => current.filter((id) => id !== r.id));
          }}
        />
      )
    }
  ];
  return (
    <Shell
      level="kms"
      current="keys"
      product="kms"
      project="kms-keys"
      crumbs={[org, product, project, { label: "Keys" }]}
    >
      <TooltipProvider>
        <Stack gap={24}>
          <PageHeader
            title="Keys"
            description={
              disabledCount
                ? `${keys.length} keys, and ${disabledCount} is disabled and cannot encrypt or sign.`
                : `${keys.length} keys, all active.`
            }
            actions={
              <>
                <Button variant="outline" icon="upload">
                  Import keys
                </Button>
                <Button variant="primary" icon="plus">
                  Create key
                </Button>
              </>
            }
          />
          <Inline gap={8}>
            <div style={{ flex: 1 }}>
              <Input
                icon="search"
                aria-label="Search keys"
                placeholder="Search keys by name or ID"
                kbd="/"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div style={{ width: 232 }}>
              <Select
                aria-label="Key usage"
                options={usageOptions}
                value={usage}
                onChange={setUsage}
              />
            </div>
          </Inline>
          <DataTable
            label="Keys in kms-keys"
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            rowLabel={(r) => r.name}
            selectable
            isSelectable={eligible}
            selectedIds={selected}
            onSelectionChange={setSelected}
            sort={sort}
            onSortChange={setSort}
            empty={
              <EmptyState
                size="sm"
                icon="search"
                title="No keys match"
                description="Try another name, ID or key usage."
                actions={
                  <Button
                    variant="link"
                    onClick={() => {
                      setQuery("");
                      setUsage("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            }
            footer={
              rows.length === keys.length
                ? `${keys.length} keys`
                : `${rows.length} of ${keys.length} keys`
            }
          />
          <FloatingActionBar
            placement="fixed"
            count={selected.length}
            total={keys.filter(eligible).length}
            onSelectAll={() => setSelected(keys.filter(eligible).map((item) => item.id))}
            onClear={() => setSelected([])}
            noun="keys"
            actions={[{ label: "Export", icon: "download", onClick: () => setSelected([]) }]}
          />
        </Stack>
      </TooltipProvider>
    </Shell>
  );
}
