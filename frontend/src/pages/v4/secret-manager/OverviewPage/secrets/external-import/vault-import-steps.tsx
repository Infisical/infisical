import type { Dispatch } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { FileTree, type FileTreeNode } from "@infisical/cipher/ui/file-tree";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Meta, SmallText } from "@infisical/cipher/ui/text";

import type { TVaultImportPreview } from "@app/components/external-migrations/VaultImportPreview.utils";
import type {
  VaultImportSelectionAction,
  VaultImportSelectionState
} from "@app/components/external-migrations/vaultImportSelection";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";

import { useV4Adapter } from "../../../../data/adapters";

import styles from "./external-import.module.css";

export const MAX_IMPORT_PATHS = 25;
const VISIBLE_SKIPPED_PATHS = 6;

const trimSlash = (path: string) => path.replace(/\/$/, "");
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function PathBadges({ paths, limit }: { paths: string[]; limit?: number }) {
  const shown = limit === undefined ? paths : paths.slice(0, limit);
  return (
    <Inline gap={4} wrap>
      {shown.map((path) => (
        <Badge key={path} tone="warn" mono className={styles.pathBadge}>
          <MiddleTruncate text={path} keepEnd={24} />
        </Badge>
      ))}
      {paths.length > shown.length && (
        <Badge tone="outline" title={paths.slice(shown.length).join("\n")}>
          +{paths.length - shown.length} more
        </Badge>
      )}
    </Inline>
  );
}

export function VaultSourceStep({
  connections,
  state,
  dispatch
}: {
  connections: TAvailableAppConnection[];
  state: VaultImportSelectionState<string[]>;
  dispatch: Dispatch<VaultImportSelectionAction<string[]>>;
}) {
  const adapter = useV4Adapter("secrets");
  const { connectionId, namespace, mountPath } = state;
  const selected = state.selection ?? [];
  const connection = connectionId ?? undefined;
  const namespaces = adapter.useVaultNamespaces(connection);
  const mounts = adapter.useVaultMounts(
    Boolean(namespace && connection),
    namespace ?? undefined,
    connection
  );
  const secretPaths = adapter.useVaultSecretPaths(
    Boolean(namespace && mountPath && connection),
    namespace ?? undefined,
    mountPath ?? undefined,
    connection
  );
  const kvMounts = (mounts.data ?? []).filter((mount) => mount.type.startsWith("kv"));
  const available = secretPaths.data?.secretPaths ?? [];
  const skipped = secretPaths.data?.skippedWildcardPaths ?? [];
  const overLimit = selected.length > MAX_IMPORT_PATHS;
  const noKv = Boolean(namespace) && !mounts.isPending && !kvMounts.length;

  return (
    <Stack gap={16}>
      <Field label="App connection">
        <Combobox
          label="App connection"
          placeholder="Select app connection"
          emptyText="No app connections found"
          options={connections.map((entry) => ({
            value: entry.id,
            label: entry.name,
            meta: entry.projectId ? undefined : "Organization"
          }))}
          value={connectionId ?? ""}
          onValueChange={(value) => dispatch({ type: "connection", value })}
        />
      </Field>
      <Field label="Namespace">
        <Combobox
          label="Namespace"
          disabled={!connectionId}
          loading={namespaces.isPending && Boolean(connectionId)}
          placeholder={connectionId ? "Select namespace" : "Select an app connection first"}
          emptyText="No Vault namespaces found"
          options={(namespaces.data ?? []).map((option) => ({
            value: option.name,
            label: option.name === "/" ? "root" : option.name
          }))}
          value={namespace ?? ""}
          onValueChange={(value) => dispatch({ type: "namespace", value })}
        />
      </Field>
      <Field
        label="Secrets engine"
        description={noKv ? "This namespace has no KV secrets engines." : undefined}
      >
        <Combobox
          label="Secrets engine"
          disabled={!namespace || !kvMounts.length}
          loading={mounts.isPending && Boolean(namespace)}
          placeholder={namespace ? "Select secrets engine" : "Select a namespace first"}
          emptyText="No KV secrets engines found"
          options={kvMounts.map((mount) => ({
            value: trimSlash(mount.path),
            label: trimSlash(mount.path),
            meta: mount.version ? `v${mount.version}` : undefined
          }))}
          value={mountPath ?? ""}
          onValueChange={(value) => dispatch({ type: "mount", value })}
        />
      </Field>
      <Field
        label="Secret paths"
        description={`Up to ${MAX_IMPORT_PATHS} per import.`}
        error={
          overLimit
            ? `${selected.length} selected. Deselect ${plural(selected.length - MAX_IMPORT_PATHS, "path")} and import the rest in another run.`
            : undefined
        }
      >
        <Combobox
          multiple
          clearable
          label="Secret paths"
          disabled={!mountPath || !available.length}
          invalid={overLimit}
          placeholder={mountPath ? "Select secret paths" : "Select a secrets engine first"}
          emptyText="No Vault secret paths found"
          options={available.map((option) => ({ value: option, label: option }))}
          value={selected}
          onValueChange={(value) => dispatch({ type: "selection", value })}
        />
      </Field>
      {skipped.length > 0 && (
        <Alert tone="warn" title={`${plural(skipped.length, "secret path")} unavailable`}>
          <Stack gap={8}>
            <span>
              Vault imports don&apos;t support wildcard (+) paths. Grant the policy behind this app
              connection access to absolute paths instead.
            </span>
            <PathBadges paths={skipped} limit={VISIBLE_SKIPPED_PATHS} />
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

const previewTree = (rows: TVaultImportPreview["rows"]) => {
  const roots: FileTreeNode[] = [];
  const stack: { depth: number; children: FileTreeNode[] }[] = [];
  rows.forEach((row) => {
    while (stack.length && stack[stack.length - 1].depth >= row.depth) stack.pop();
    const children: FileTreeNode[] = [];
    const folder = row.kind === "folder";
    (stack.length ? stack[stack.length - 1].children : roots).push({
      id: row.key,
      name: row.name,
      type: folder ? "folder" : "file",
      children: folder ? children : undefined,
      meta: row.source && (
        <Meta mono truncate title={row.source}>
          {row.source}
        </Meta>
      )
    });
    if (folder) stack.push({ depth: row.depth, children });
  });
  return roots;
};

export function VaultReviewStep({
  preview,
  keepStructure,
  onKeepStructureChange
}: {
  preview: TVaultImportPreview;
  keepStructure: boolean;
  onKeepStructureChange: (keep: boolean) => void;
}) {
  const folderIds = preview.rows.filter((row) => row.kind === "folder").map((row) => row.key);
  const invalid = preview.invalidPaths;
  return (
    <Stack gap={16}>
      <Checkbox
        label="Preserve folder structure"
        description="Create folders that match each Vault secret path."
        checked={keepStructure}
        onChange={onKeepStructureChange}
      />
      {invalid.length > 0 && (
        <Alert
          tone="warn"
          title={
            invalid.length > 1
              ? `${invalid.length} secret paths can't become folders`
              : "1 secret path can't become a folder"
          }
        >
          <Stack gap={8}>
            <span>Folder names allow only letters, numbers, dashes and underscores.</span>
            <PathBadges paths={invalid} />
          </Stack>
        </Alert>
      )}
      <Stack gap={8}>
        <SmallText muted>{preview.headline}</SmallText>
        <FileTree
          key={folderIds.join("|")}
          label="Import preview"
          items={previewTree(preview.rows)}
          defaultExpanded={folderIds}
          selectable="none"
          size="sm"
          truncate="middle"
          maxHeight={520}
        />
      </Stack>
    </Stack>
  );
}
