import { useReducer, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import { buildVaultImportPreview } from "@app/components/external-migrations/VaultImportPreview.utils";
import {
  createVaultImportSelection,
  vaultImportSelectionReducer
} from "@app/components/external-migrations/vaultImportSelection";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import {
  ExternalMigrationImportStatus,
  type TImportVaultSecretsResponse
} from "@app/hooks/api/migration/types";

import { readableFailure, toast } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { MAX_IMPORT_PATHS, VaultReviewStep, VaultSourceStep } from "./vault-import-steps";

const sourceBlockOf = (
  { connectionId, namespace, mountPath }: { [key: string]: unknown },
  count: number
) => {
  if (!connectionId) return "Select an app connection";
  if (!namespace) return "Select a namespace";
  if (!mountPath) return "Select a secrets engine";
  if (!count) return "Select at least one secret path";
  if (count > MAX_IMPORT_PATHS) return `Select at most ${MAX_IMPORT_PATHS} secret paths`;
  return undefined;
};

const announce = (
  { status, importedPaths, approvalRequiredPaths }: TImportVaultSecretsResponse,
  count: number
) => {
  if (status === ExternalMigrationImportStatus.ApprovalRequired) {
    const pending = approvalRequiredPaths?.length ?? count;
    toast({
      title:
        pending > 1
          ? `Secret change request created for ${pending} Vault paths. Awaiting approval.`
          : "Secret change request created successfully. Awaiting approval."
    });
    return;
  }
  const folders = importedPaths?.length ?? 0;
  const source = count > 1 ? `${count} HashiCorp Vault paths` : "HashiCorp Vault";
  toast({
    tone: "ok",
    title:
      folders > 1
        ? `Imported secrets from ${source} into ${folders} folders`
        : `Imported secrets from ${source}`
  });
};

export function VaultImportSheet({
  connections,
  projectId,
  environment,
  path,
  onClose
}: {
  connections: TAvailableAppConnection[];
  projectId: string;
  environment: { value: string; label: string };
  path: string;
  onClose: () => void;
}) {
  const importVault = useV4Adapter("secrets").useImportVaultSecrets();
  const [keepStructure, setKeepStructure] = useState(false);
  const [state, dispatch] = useReducer(
    vaultImportSelectionReducer<string[]>,
    connections.map(({ id }) => id),
    createVaultImportSelection<string[]>
  );
  const selected = state.selection ?? [];
  const initialConnection = useRef(state.connectionId);
  const completed = useRef(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty:
      state.connectionId !== initialConnection.current ||
      Boolean(state.namespace || state.mountPath || selected.length || keepStructure),
    onDiscard: onClose
  });
  const preview = buildVaultImportPreview({
    selectedPaths: selected,
    destinationPath: path,
    mountPath: state.mountPath ?? "",
    keepVaultStructure: keepStructure
  });

  const submit = async () => {
    completed.current = true;
    try {
      const result = await importVault
        .mutateAsync({
          projectId,
          environment: environment.value,
          secretPath: path,
          vaultNamespace: state.namespace ?? "",
          mountPath: state.mountPath ?? "",
          vaultSecretPaths: selected,
          connectionId: state.connectionId ?? "",
          keepVaultStructure: keepStructure
        })
        .catch(readableFailure("Couldn't import secrets from HashiCorp Vault."));
      announce(result, selected.length);
      onClose();
    } catch (error) {
      completed.current = false;
      throw error;
    }
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        open
        title="Import from HashiCorp Vault"
        description={`Secrets go to ${environment.label} at ${path}.`}
        onOpenChange={(next) => {
          if (next || completed.current) return;
          requestDiscard();
        }}
        completeLabel="Import secrets"
        onComplete={submit}
        steps={[
          {
            title: "Source",
            disabledReason: sourceBlockOf(state, selected.length),
            content: <VaultSourceStep connections={connections} state={state} dispatch={dispatch} />
          },
          {
            title: "Review",
            disabledReason: preview.invalidPaths.length
              ? "Rename these paths in Vault or turn off folder structure"
              : undefined,
            content: (
              <VaultReviewStep
                preview={preview}
                keepStructure={keepStructure}
                onKeepStructureChange={setKeepStructure}
              />
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard Vault import?"
        description="Your selected Vault namespace and secret paths will be lost."
      />
    </>
  );
}
