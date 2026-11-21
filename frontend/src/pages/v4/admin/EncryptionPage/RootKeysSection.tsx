import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import {
  RootKeyEncryptionStrategy,
  type TCreatedEncryptionKeyRotation,
  type TEncryptionKeyRotation,
  type TEncryptionRootKey
} from "@app/hooks/api/admin/types";

import { saved } from "../../access/toast";
import { Muted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { DeactivateKeyDialog } from "./DeactivateKeyDialog";
import { GeneratedKeyDialog } from "./GeneratedKeyDialog";

type KeyRow =
  | { kind: "staged"; label: string | null; createdAt: string }
  | ({ kind: "rotation" } & TEncryptionKeyRotation);

const rowId = (row: KeyRow) =>
  row.kind === "staged" ? "staged" : `${row.label}-${row.activatedAt}`;

const NO_ACTIONS = "Only a staged or expiring key has actions";

const KeyStatus = ({ row, rootKey }: { row: KeyRow; rootKey: TEncryptionRootKey }) => {
  if (row.kind === "staged")
    return (
      <StatusText tone="neutral" icon="sync">
        Staged, not applied
      </StatusText>
    );
  if (row.retiredAt)
    return (
      <StatusText tone="neutral" icon="x">
        Removed
      </StatusText>
    );
  if (!row.supersededAt)
    return (
      <StatusText tone="ok" icon="check-c">
        Active
      </StatusText>
    );
  if (rootKey.expiring?.label === row.label)
    return (
      <Tooltip
        content={`Removed automatically on ${new Date(rootKey.expiring.expiresAt).toLocaleString()}`}
      >
        <StatusText tone="warn" icon="clock" tabIndex={0}>
          {`Expires ${new Date(rootKey.expiring.expiresAt).toLocaleDateString()}`}
        </StatusText>
      </Tooltip>
    );
  return (
    <StatusText tone="neutral" icon="clock">
      Expiring
    </StatusText>
  );
};

export const RootKeysSection = () => {
  const admin = useV4Adapter("admin");
  const { data: rootKey, isPending, error } = admin.useEncryptionRootKey();
  const createRotation = admin.useCreateEncryptionKeyRotation();
  const deleteStagedKey = admin.useDeleteStagedEncryptionKey();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data: rotationsPage, isPending: rotationsPending } = admin.useEncryptionKeyRotations({
    offset: (page - 1) * pageSize,
    limit: pageSize
  });
  const [generatedKey, setGeneratedKey] = useState<TCreatedEncryptionKeyRotation | null>(null);
  const [generating, setGenerating] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  if (error || (!isPending && !rootKey))
    return (
      <Alert tone="warn" title="Encryption status could not be loaded">
        Reload the page to try again. While this is unavailable you cannot generate, discard, or
        remove an encryption key from here.
      </Alert>
    );

  const isHsmManaged = rootKey?.encryptionStrategy === RootKeyEncryptionStrategy.HSM;

  const generate = async () => {
    if (!rootKey) return;
    setGenerating(true);
    const rotation = await createRotation
      .mutateAsync({ replaceStaged: Boolean(rootKey.staged) })
      .catch(() => null);
    setGenerating(false);
    setGeneratedKey(rotation);
  };

  const discard = async () => {
    if (!rootKey?.staged?.label) return;
    setDiscarding(true);
    const done = await deleteStagedKey.mutateAsync({ label: rootKey.staged.label }).then(
      () => true,
      () => false
    );
    setDiscarding(false);
    if (done) saved("Generated encryption key discarded.");
  };

  const rows: KeyRow[] = [
    ...(rootKey?.staged && page === 1 ? [{ kind: "staged" as const, ...rootKey.staged }] : []),
    ...(rotationsPage?.rotations ?? []).map((entry) => ({ kind: "rotation" as const, ...entry }))
  ];
  const totalCount = rotationsPage?.totalCount ?? 0;

  const columns: DataTableColumn<KeyRow>[] = [
    {
      id: "label",
      header: "Label",
      primary: true,
      mono: true,
      grow: true,
      text: (row) => row.label ?? "unlabelled",
      render: (row) => row.label ?? "unlabelled"
    },
    {
      id: "activatedAt",
      header: "Active from",
      width: 300,
      render: (row) =>
        row.kind === "staged" ? (
          <Muted>{`Generated ${new Date(row.createdAt).toLocaleString()}`}</Muted>
        ) : (
          new Date(row.activatedAt).toLocaleString()
        )
    },
    {
      id: "status",
      header: "Status",
      width: 200,
      render: (row) => rootKey && <KeyStatus row={row} rootKey={rootKey} />
    }
  ];

  const hasAction = (row: KeyRow) =>
    row.kind === "staged" || (Boolean(rootKey?.expiring) && rootKey?.expiring?.label === row.label);

  return (
    <Stack gap={12}>
      {isHsmManaged && (
        <Alert tone="warn">
          This instance wraps its root key with an HSM, so there is no environment variable to
          rotate. Rotate the key on the HSM itself, or switch the encryption strategy to software
          first.
        </Alert>
      )}
      {rootKey?.expiring && (
        <Alert
          tone="warn"
          title="Root encryption key rotation in progress"
          actions={
            <Button variant="outline" size="sm" onClick={() => setDeactivating(true)}>
              Deactivate now
            </Button>
          }
        >
          The previous key is still active. Once all instances have been migrated to the new
          encryption key it is safe to remove this key.
        </Alert>
      )}
      <SettingsCard
        title="Root encryption keys"
        description="Rotate the key that protects every secret on this instance. Removed keys stay listed so you can tell which archived key a restored backup needs."
        flush
        action={
          <Button
            icon="plus"
            loading={generating}
            disabled={isPending}
            disabledReason={
              isHsmManaged
                ? "Rotate the key on the HSM, or switch to software encryption"
                : undefined
            }
            onClick={generate}
          >
            Generate new key
          </Button>
        }
      >
        <DataTable
          label="Root encryption keys"
          rows={rows}
          columns={columns}
          getRowId={rowId}
          rowLabel={(row) => row.label ?? "unlabelled"}
          loading={isPending || rotationsPending}
          rowActions={{
            menuDisabledReason: (row) => (hasAction(row) ? undefined : NO_ACTIONS),
            renderMenu: (row) =>
              row.kind === "staged" ? (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!row.label || discarding}
                  description="Never used, so nothing is lost"
                  onSelect={discard}
                >
                  <Icon name="trash" />
                  Discard generated key
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  description="Backups taken before the rotation still need it, so keep it archived."
                  onSelect={() => setDeactivating(true)}
                >
                  <Icon name="lock" />
                  Deactivate old key
                </DropdownMenuItem>
              )
          }}
          empty={<EmptyState size="sm" icon="key" title="No root keys yet" />}
          pagination={
            totalCount > pageSize ? (
              <Pagination
                label="Root key pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            ) : undefined
          }
        />
      </SettingsCard>

      {rootKey?.expiring && (
        <DeactivateKeyDialog
          expiring={rootKey.expiring}
          open={deactivating}
          onOpenChange={setDeactivating}
        />
      )}
      <GeneratedKeyDialog generatedKey={generatedKey} onClose={() => setGeneratedKey(null)} />
    </Stack>
  );
};
