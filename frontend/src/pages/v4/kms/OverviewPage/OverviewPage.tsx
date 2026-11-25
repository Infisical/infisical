import { useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { FloatingActionBar } from "@infisical/cipher/ui/floating-action-bar";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import FileSaver from "file-saver";
import { FileSignatureIcon, LockOpenIcon } from "lucide-react";

import { KmsKeyUsage, type TCmek } from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { failed, saved, toast } from "../../access/toast";
import { AccessRestricted } from "../../access/ui";
import { copyText } from "../../clipboard";
import { usePageSize } from "../../components/use-page-size";
import { useV4Adapter } from "../../data/adapters";
import { useProjectName } from "../../shell/resource-name";
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

const isServed = (item: TCmek) => item.isPublicKeyPublished && !item.isDisabled;

const copy = async (value: string, label: string) => {
  if (await copyText(value, `Couldn't copy the ${label}`)) saved(`${label} copied`);
};

const KeyMenu = ({
  item,
  permissions,
  onOpen,
  onToggle,
  onTogglePublish
}: {
  item: TCmek;
  permissions: KeyPermissions;
  onOpen: (kind: Open["kind"]) => void;
  onToggle: () => void;
  onTogglePublish: () => void;
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
      {item.kid && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabledReason={
              permissions.edit && permissions.publishPublicKey ? undefined : RESTRICTED
            }
            onSelect={onTogglePublish}
          >
            <Icon name="globe" />
            {item.isPublicKeyPublished ? "Unpublish public key" : "Publish public key"}
          </DropdownMenuItem>
          {isServed(item) && item.jwksUrl && (
            <DropdownMenuItem onSelect={() => item.jwksUrl && copy(item.jwksUrl, "JWKS URL")}>
              <Icon name="link" />
              Copy JWKS URL
            </DropdownMenuItem>
          )}
          {isServed(item) && (
            <DropdownMenuItem onSelect={() => item.kid && copy(item.kid, "kid")}>
              <Icon name="copy" />
              Copy kid
            </DropdownMenuItem>
          )}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabledReason={exportReason(item, permissions)}
        onSelect={() => onOpen("export")}
      >
        <Icon name="download" />
        Export key
      </DropdownMenuItem>
      <DropdownMenuItem disabledReason={editReason} onSelect={() => onOpen("edit")}>
        <Icon name="pencil" />
        Edit key
      </DropdownMenuItem>
      {item.keyUsage === KmsKeyUsage.ENCRYPT_DECRYPT && (
        <DropdownMenuItem
          disabledReason={permissions.rotate ? disabledReason(item) : RESTRICTED}
          onSelect={() => onOpen("rotate")}
        >
          <Icon name="sync" />
          Rotate key
        </DropdownMenuItem>
      )}
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
          onClick={async () => {
            if (!(await copyText(id, "Failed to copy key ID"))) return;
            setCopied(true);
            saved("Key ID copied");
            window.setTimeout(() => setCopied(false), 1200);
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

const nameStyle = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
} as const;
const iconStyle = { display: "inline-flex", flexShrink: 0 } as const;

const columns: DataTableColumn<TCmek>[] = [
  {
    id: "name",
    header: "Name",
    primary: true,
    sortable: true,
    grow: true,
    minWidth: 200,
    text: (r) => `${r.name}: ${r.description ?? ""}`,
    render: (r) => (
      <Inline gap={8} align="center" wrap={false} style={{ minWidth: 0 }}>
        <span style={nameStyle}>{r.name}</span>
        {r.description && (
          <Tooltip content={r.description} side="top">
            <span aria-label={r.description} role="img" style={iconStyle}>
              <Icon name="info" size="var(--cipher-size-icon-small)" />
            </span>
          </Tooltip>
        )}
        {!r.isExportable && (
          <Tooltip content="Created as non-exportable" side="top">
            <span aria-label="Not exportable" role="img" style={iconStyle}>
              <Icon name="lock" size="var(--cipher-size-icon-small)" />
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
    width: 160,
    render: (r) => (
      <Inline gap={4} align="center" wrap={false}>
        {r.isDisabled ? (
          <Badge tone="outline">Disabled</Badge>
        ) : (
          <Badge tone="ok" dot>
            Active
          </Badge>
        )}
        {isServed(r) && (
          <Tooltip content={r.jwksUrl ?? "Public key published"} side="top">
            <Badge tone="info" tabIndex={0}>
              Public
            </Badge>
          </Tooltip>
        )}
      </Inline>
    )
  },
  { id: "version", header: "Version", width: 88, render: (r) => `v${r.version}` },
  { id: "created", header: "Created", width: 104, render: (r) => r.createdAt.slice(0, 10) }
];

const lastPageWithRows = ({
  page,
  pageSize,
  totalCount,
  isPending,
  rows
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  isPending: boolean;
  rows: number;
}) => {
  if (isPending || page === 1 || rows > 0) return page;
  return Math.max(1, Math.ceil(totalCount / pageSize));
};

export const OverviewPage = () => {
  const { orgId, projectId } = useKmsProjectId();
  const kms = useV4Adapter("kms");
  const permissions = useKeyPermissions(projectId);
  const projectName = useProjectName(projectId).name;
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("cmekClientTable", 20);
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
    search: debouncedSearch,
    orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC
  });
  const updateKey = kms.useUpdateKey();
  const bulkExport = kms.useBulkExport();
  const keys = data?.keys ?? [];
  const totalCount = data?.totalCount ?? 0;
  const eligible = (item: TCmek) => !item.isDisabled && item.isExportable;
  const filtered = Boolean(debouncedSearch);
  const createReason = permissions.create ? undefined : RESTRICTED;

  const lastFilledPage = lastPageWithRows({
    page,
    pageSize,
    totalCount,
    isPending,
    rows: keys.length
  });
  if (lastFilledPage !== page) setPage(lastFilledPage);

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

  const togglePublish = async (item: TCmek) => {
    try {
      await updateKey.mutateAsync({
        keyId: item.id,
        projectId,
        isPublicKeyPublished: !item.isPublicKeyPublished
      });
      saved(
        item.isPublicKeyPublished
          ? `Public key of ${item.name} unpublished`
          : `Public key of ${item.name} published`
      );
    } catch (error) {
      failed(
        `Failed to ${item.isPublicKeyPublished ? "unpublish" : "publish"} the public key`,
        error
      );
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

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Keys"
          description="Encryption, signing, and MAC keys for this project."
          badges={
            <DocumentationLink
              href="https://infisical.com/docs/documentation/platform/kms/keys"
              subject="keys"
            />
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
          searchLabel="Search keys"
          searchPlaceholder="Search keys by name or ID"
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            changePage(1);
          }}
        />
        <DataTable
          filtered={filtered}
          label={projectName ? `Keys in ${projectName}` : "Keys"}
          rows={keys}
          columns={columns}
          loading={isPending}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          rowActions={{
            renderMenu: (r) => (
              <KeyMenu
                item={r}
                permissions={permissions}
                onOpen={(kind) => setOpen({ kind, key: r } as Open)}
                onToggle={() => toggleKey(r)}
                onTogglePublish={() => togglePublish(r)}
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
                      changePage(1);
                    }}
                  >
                    Clear search
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
