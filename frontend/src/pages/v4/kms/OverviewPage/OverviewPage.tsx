import { useState } from "react";
import FileSaver from "file-saver";
import { FileSignatureIcon, LockOpenIcon, PencilIcon } from "lucide-react";

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
import { Loader } from "@app/components/v4/ui/loader";
import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { KmsKeyUsage, type TCmek } from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { failed, saved, toast } from "../../access/toast";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { ImportKeysDialog } from "../keys/import-dialog";
import { DeleteKeyDialog, ExportKeyDialog, RotateKeyDialog } from "../keys/key-dialogs";
import { KeySheet } from "../keys/key-sheet";
import {
  DecryptDialog,
  EncryptDialog,
  GenerateMacDialog,
  SignDialog,
  VerifyDialog,
  VerifyMacDialog
} from "../keys/operation-dialogs";
import {
  algorithmLabel,
  isAsymmetricKey,
  type KeyPermissions,
  keysToExportJson,
  RESTRICTED,
  usageLabel,
  useKeyPermissions,
  useKmsProjectId
} from "../keys/shared";

const MAX_SELECTED = 100;

type Operation = "encrypt" | "decrypt" | "sign" | "verify" | "generateMac" | "verifyMac";
type Open =
  | { kind: "create" | "import" }
  | { kind: Operation | "edit" | "export" | "rotate" | "delete"; key: TCmek };

const usageOptions = Object.values(KmsKeyUsage).map((value) => ({
  value,
  label: usageLabel[value]
}));

const operationsByUsage = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: [
    { kind: "encrypt", label: "Encrypt data", icon: <Icon name="lock" />, permission: "encrypt" },
    {
      kind: "decrypt",
      label: "Decrypt data",
      icon: <Icon icon={LockOpenIcon} />,
      permission: "decrypt"
    }
  ],
  [KmsKeyUsage.SIGN_VERIFY]: [
    {
      kind: "sign",
      label: "Sign data",
      icon: <Icon icon={FileSignatureIcon} />,
      permission: "sign"
    },
    { kind: "verify", label: "Verify data", icon: <Icon name="check-c" />, permission: "verify" }
  ],
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: [
    {
      kind: "generateMac",
      label: "Generate MAC",
      icon: <Icon icon={FileSignatureIcon} />,
      permission: "generateMac"
    },
    {
      kind: "verifyMac",
      label: "Verify MAC",
      icon: <Icon name="check-c" />,
      permission: "verifyMac"
    }
  ]
} as const satisfies Record<
  KmsKeyUsage,
  readonly {
    kind: Operation;
    label: string;
    icon: React.ReactNode;
    permission: keyof KeyPermissions;
  }[]
>;

const disabledReason = (item: TCmek) => (item.isDisabled ? "Enable the key first" : undefined);

const exportReason = (item: TCmek, permissions: KeyPermissions) => {
  const asymmetric = isAsymmetricKey(item);
  const blocked = !permissions.exportPrivateKey || !item.isExportable;
  if (blocked && (!asymmetric || !permissions.read)) {
    return !permissions.exportPrivateKey ? RESTRICTED : "Created as non-exportable";
  }
  return disabledReason(item);
};

const rotateReason = (item: TCmek, permissions: KeyPermissions) => {
  if (!permissions.rotate) return RESTRICTED;
  if (item.keyUsage !== KmsKeyUsage.ENCRYPT_DECRYPT) return "Only encryption keys rotate";
  return disabledReason(item);
};

const KeyMenu = ({
  item,
  permissions,
  onOpen,
  onToggle
}: {
  item: TCmek;
  permissions: KeyPermissions;
  onOpen: (kind: Open["kind"]) => void;
  onToggle: () => void;
}) => {
  const editReason = permissions.edit ? undefined : RESTRICTED;
  let deleteReason: string | undefined;
  if (!permissions.remove) deleteReason = RESTRICTED;
  else if (item.hasDeleteProtection) deleteReason = "Turn off delete protection first";
  return (
    <>
      {operationsByUsage[item.keyUsage].map((operation) => (
        <DropdownMenuItem
          key={operation.kind}
          disabledReason={permissions[operation.permission] ? disabledReason(item) : RESTRICTED}
          onSelect={() => onOpen(operation.kind)}
        >
          {operation.icon}
          {operation.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabledReason={exportReason(item, permissions)}
        onSelect={() => onOpen("export")}
      >
        <Icon name="download" />
        Export key
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={editReason} onSelect={() => onOpen("edit")}>
        <Icon icon={PencilIcon} />
        Edit key
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={editReason} onSelect={onToggle}>
        <Icon name={item.isDisabled ? "check-c" : "x"} />
        {item.isDisabled ? "Enable key" : "Disable key"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabledReason={deleteReason}
        onSelect={() => onOpen("delete")}
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
            navigator.clipboard?.writeText(id).then(
              () => {
                setCopied(true);
                saved("Key ID copied");
                window.setTimeout(() => setCopied(false), 1200);
              },
              (error) => failed("Failed to copy key ID", error)
            );
          }}
        >
          Copy key ID
        </Button>
      </Tooltip>
    </Inline>
  );
};

const OpenDialog = ({
  open,
  orgId,
  projectId,
  permissions,
  onClose,
  onDeleted
}: {
  open: Open;
  orgId: string;
  projectId: string;
  permissions: KeyPermissions;
  onClose: () => void;
  onDeleted: (keyId: string) => void;
}) => {
  if (!("key" in open)) {
    if (open.kind === "import") return <ImportKeysDialog projectId={projectId} onClose={onClose} />;
    return <KeySheet orgId={orgId} projectId={projectId} onClose={onClose} />;
  }
  const props = { cmek: open.key, onClose };
  switch (open.kind) {
    case "edit":
      return <KeySheet orgId={orgId} projectId={projectId} {...props} />;
    case "encrypt":
      return <EncryptDialog {...props} />;
    case "decrypt":
      return <DecryptDialog {...props} />;
    case "sign":
      return <SignDialog {...props} />;
    case "verify":
      return <VerifyDialog {...props} />;
    case "generateMac":
      return <GenerateMacDialog {...props} />;
    case "verifyMac":
      return <VerifyMacDialog {...props} />;
    case "export":
      return <ExportKeyDialog permissions={permissions} {...props} />;
    case "rotate":
      return <RotateKeyDialog {...props} />;
    default:
      return <DeleteKeyDialog onDeleted={onDeleted} {...props} />;
  }
};

export const OverviewPage = () => {
  const { orgId, projectId } = useKmsProjectId();
  const kms = useV4Adapter("kms");
  const permissions = useKeyPermissions(projectId);
  const { projects } = useV4Session();
  const projectName = projects.find((project) => project.id === projectId)?.name ?? projectId;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const usage = filters.find((filter) => filter.field === "usage")?.values[0] ?? "all";
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<Open>();
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
  const bulkExport = kms.useBulkExport();
  const keys = data?.keys ?? [];
  const totalCount = data?.totalCount ?? 0;
  const rows = keys.filter((item) => usage === "all" || item.keyUsage === usage);
  const eligible = (item: TCmek) => !item.isDisabled && item.isExportable;
  const filtered = Boolean(search) || usage !== "all";
  const createReason = permissions.create ? undefined : RESTRICTED;

  if (permissions.isPending) return <Loader size="page" label="Loading keys" />;
  if (!permissions.read) return <AccessRestricted requirement="read KMS keys" />;

  const changePage = (next: number) => {
    setPage(next);
    setSelected([]);
  };

  const toggleKey = async (item: TCmek) => {
    try {
      await updateKey.mutateAsync({ keyId: item.id, projectId, isDisabled: !item.isDisabled });
      if (!item.isDisabled) setSelected((current) => current.filter((id) => id !== item.id));
      saved(item.isDisabled ? "Key enabled" : "Key disabled");
    } catch (error) {
      failed(`Failed to ${item.isDisabled ? "enable" : "disable"} key`, error);
    }
  };

  const exportSelected = async () => {
    try {
      const { keys: exported } = await bulkExport.mutateAsync({ keyIds: selected });
      FileSaver.saveAs(
        new Blob([JSON.stringify(keysToExportJson(exported), null, 2)], {
          type: "application/json;charset=utf-8;"
        }),
        `kms-keys-export-${new Date().toISOString().slice(0, 10)}.json`
      );
      setSelected([]);
      saved(`Exported ${exported.length} ${exported.length === 1 ? "key" : "keys"}`);
    } catch (error) {
      failed("Failed to export keys", error);
    }
  };

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
          {r.description && (
            <Tooltip content={r.description} side="top">
              <span aria-label={r.description} role="img">
                <Icon name="info" size={14} />
              </span>
            </Tooltip>
          )}
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
          description="Encryption, signing, and MAC keys for this project."
          badges={
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms/keys" />
          }
          actions={
            <>
              <Button
                variant="outline"
                icon="upload"
                disabledReason={createReason}
                onClick={() => setOpen({ kind: "import" })}
              >
                Import keys
              </Button>
              <Button
                variant="accent"
                icon="plus"
                disabledReason={createReason}
                onClick={() => setOpen({ kind: "create" })}
              >
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
                changePage(1);
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
                disabledReason: (r) => rotateReason(r, permissions),
                onSelect: (r) => setOpen({ kind: "rotate", key: r })
              }
            ],
            renderMenu: (r) => (
              <KeyMenu
                item={r}
                permissions={permissions}
                onOpen={(kind) => setOpen({ kind, key: r } as Open)}
                onToggle={() => toggleKey(r)}
              />
            )
          }}
          selectable
          selectionDisabledReason={(r) => {
            if (r.isDisabled) return "Disabled keys can't be exported";
            if (!r.isExportable) return "Created as non-exportable";
            return undefined;
          }}
          selectedIds={selected}
          onSelectionChange={(ids) => {
            if (ids.length > MAX_SELECTED) {
              toast({ tone: "bad", title: `Select at most ${MAX_SELECTED} keys to export` });
              setSelected(ids.slice(0, MAX_SELECTED));
              return;
            }
            setSelected(ids);
          }}
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
                actions={
                  <Button
                    icon="plus"
                    disabledReason={createReason}
                    onClick={() => setOpen({ kind: "create" })}
                  >
                    Create key
                  </Button>
                }
              />
            )
          }
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Key pages"
                variant="compact"
                page={page}
                onPageChange={changePage}
                total={totalCount}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  changePage(1);
                }}
              />
            ) : undefined
          }
          actionBar={
            <FloatingActionBar
              count={selected.length}
              total={keys.filter(eligible).length}
              onSelectAll={() => setSelected(keys.filter(eligible).map((item) => item.id))}
              onClear={() => setSelected([])}
              noun="keys"
              actions={[
                {
                  label: "Export",
                  icon: "download",
                  loading: bulkExport.isPending,
                  disabledReason: permissions.exportPrivateKey ? undefined : RESTRICTED,
                  onClick: exportSelected
                }
              ]}
            />
          }
        />
      </Stack>
      {open && (
        <OpenDialog
          open={open}
          orgId={orgId}
          projectId={projectId}
          permissions={permissions}
          onClose={() => setOpen(undefined)}
          onDeleted={(keyId) => setSelected((current) => current.filter((id) => id !== keyId))}
        />
      )}
    </TooltipProvider>
  );
};
