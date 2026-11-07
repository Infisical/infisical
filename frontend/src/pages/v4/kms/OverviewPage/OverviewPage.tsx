import { useState } from "react";
import { useParams } from "@tanstack/react-router";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { FloatingActionBar } from "@app/components/v4/ui/floating-action-bar";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { KmsKeyUsage, type TCmek } from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";

const usageLabel: Record<KmsKeyUsage, string> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: "Encrypt and decrypt",
  [KmsKeyUsage.SIGN_VERIFY]: "Sign and verify",
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: "Generate and verify MAC"
};
const operations: Record<KmsKeyUsage, [string, string]> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: ["Encrypt data", "Decrypt data"],
  [KmsKeyUsage.SIGN_VERIFY]: ["Sign data", "Verify data"],
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: ["Generate MAC", "Verify MAC"]
};
const usageOptions = Object.values(KmsKeyUsage).map((value) => ({
  value,
  label: usageLabel[value]
}));
const algorithmLabel = (algorithm: TCmek["algorithm"]) =>
  algorithm.replaceAll("_", "-").toUpperCase();

const disabledBlock = (item: TCmek) => (item.isDisabled ? "Enable the key first" : undefined);
const rotateBlock = (item: TCmek) =>
  item.keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT
    ? disabledBlock(item)
    : "Only encryption keys rotate";

const KeyMenu = ({ item, onToggle }: { item: TCmek; onToggle: () => void }) => {
  const off = disabledBlock(item);
  const exportBlock = item.isExportable ? off : "Created as non-exportable";
  const deleteBlock = item.hasDeleteProtection ? "Turn off delete protection first" : undefined;
  return (
    <>
      <DropdownMenuItem disabled={Boolean(off)} description={off}>
        <Icon name="lock" />
        {operations[item.keyUsage][0]}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={Boolean(off)} description={off}>
        <Icon name="check-c" />
        {operations[item.keyUsage][1]}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={Boolean(exportBlock)} description={exportBlock}>
        <Icon name="download" />
        Export key
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Icon name="settings" />
        Edit key
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onToggle}>
        <Icon name={item.isDisabled ? "check-c" : "x"} />
        {item.isDisabled ? "Enable key" : "Disable key"}
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
    </>
  );
};

const KeyId = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Inline gap={4} align="center" wrap={false}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Tooltip content={<code>{id}</code>} side="top">
          <MiddleTruncate mono keepEnd={4} text={id} title={false} tabIndex={0} />
        </Tooltip>
      </div>
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

export const OverviewPage = () => {
  const { projectId } = useParams({
    from: "/v4/organizations/$orgId/projects/kms/$projectId/overview"
  });
  const kms = useV4Adapter("kms");
  const { projects } = useV4Session();
  const projectName = projects.find((project) => project.id === projectId)?.name ?? projectId;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const usage = filters.find((filter) => filter.field === "usage")?.values[0] ?? "all";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "name",
    direction: "asc"
  });
  const { data, isPending } = kms.useKeys({
    projectId,
    offset: (page - 1) * pageSize,
    limit: pageSize,
    search,
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC
  });
  const updateKey = kms.useUpdateKey();
  const rotateKey = kms.useRotateKey();
  const keys = data?.keys ?? [];
  const totalCount = data?.totalCount ?? 0;
  const rows = keys.filter((item) => usage === "all" || item.keyUsage === usage);
  const eligible = (item: TCmek) => !item.isDisabled && item.isExportable;
  const disabledCount = keys.filter((item) => item.isDisabled).length;
  const filtered = Boolean(search) || usage !== "all";
  const columns: DataTableColumn<TCmek>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (r) => `${r.name}: ${r.description ?? ""}`,
      render: (r) => (
        <Inline gap={8} align="center" wrap={false}>
          {r.name}
          {!r.isExportable && (
            <Tooltip content="Created as non-exportable" side="top">
              <span aria-label="Not exportable" role="img">
                <Icon name="lock" size={14} />
              </span>
            </Tooltip>
          )}
        </Inline>
      )
    },
    {
      id: "id",
      header: "Key ID",
      width: 196,
      maxWidth: 196,
      text: (r) => r.id,
      render: (r) => <KeyId id={r.id} />
    },
    { id: "usage", header: "Key usage", width: 172, render: (r) => usageLabel[r.keyUsage] },
    {
      id: "algorithm",
      header: "Algorithm",
      width: 128,
      render: (r) => algorithmLabel(r.algorithm)
    },
    {
      id: "status",
      header: "Status",
      width: 112,
      render: (r) =>
        r.isDisabled ? (
          <Badge tone="outline">Disabled</Badge>
        ) : (
          <Badge tone="ok" dot>
            Active
          </Badge>
        )
    },
    { id: "version", header: "Version", width: 72, render: (r) => `v${r.version}` },
    { id: "created", header: "Created", width: 104, render: (r) => r.createdAt.slice(0, 10) }
  ];
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Keys"
          description={
            disabledCount
              ? `Encryption, signing, and MAC keys for this project. ${disabledCount} disabled ${disabledCount === 1 ? "key" : "keys"} cannot encrypt or sign.`
              : "Encryption, signing, and MAC keys for this project."
          }
          badges={
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms/keys" />
          }
          actions={
            <>
              <Button variant="outline" icon="upload">
                Import keys
              </Button>
              <Button variant="accent" icon="plus">
                Create key
              </Button>
            </>
          }
        />
        <FilterBar
          label="Key filters"
          fields={[{ key: "usage", label: "Key usage", type: "select", options: usageOptions }]}
          value={filters}
          onChange={setFilters}
          search={
            <Input
              icon="search"
              aria-label="Search keys"
              placeholder="Search keys by name or ID"
              kbd="/"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
        />
        <DataTable
          label={`Keys in ${projectName}`}
          rows={rows}
          columns={columns}
          loading={isPending}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          rowActions={{
            inline: [
              {
                label: "Rotate key",
                icon: "sync",
                disabledReason: rotateBlock,
                onSelect: (r) =>
                  rotateKey.mutateAsync({ keyId: r.id, projectId }).catch(() => undefined)
              }
            ],
            renderMenu: (r) => (
              <KeyMenu
                item={r}
                onToggle={() => {
                  updateKey
                    .mutateAsync({ keyId: r.id, projectId, isDisabled: !r.isDisabled })
                    .catch(() => undefined);
                  setSelected((current) => current.filter((id) => id !== r.id));
                }}
              />
            )
          }}
          selectable
          isSelectable={eligible}
          selectedIds={selected}
          onSelectionChange={setSelected}
          sort={sort}
          onSortChange={setSort}
          empty={
            filtered ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No keys match"
                actions={
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearch("");
                      setFilters([]);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                icon="key"
                title="No keys yet"
                actions={<Button icon="plus">Create key</Button>}
              />
            )
          }
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Key pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={setPageSize}
              />
            ) : undefined
          }
          actionBar={
            <FloatingActionBar
              placement="contained"
              count={selected.length}
              total={keys.filter(eligible).length}
              onSelectAll={() => setSelected(keys.filter(eligible).map((item) => item.id))}
              onClear={() => setSelected([])}
              noun="keys"
              actions={[{ label: "Export", icon: "download", onClick: () => setSelected([]) }]}
            />
          }
        />
      </Stack>
    </TooltipProvider>
  );
};
