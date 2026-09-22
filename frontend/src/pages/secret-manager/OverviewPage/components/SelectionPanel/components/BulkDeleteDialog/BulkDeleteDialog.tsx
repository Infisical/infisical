import { useMemo, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";
import { ProjectSecretsImportedBy, UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { SecretV3RawSanitized, TSecretFolder } from "@app/hooks/api/types";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";

import { EntryType } from "../../SelectionPanel";
import { BulkSelectionTable } from "../BulkSelectionTable";

const CONFIRMATION_KEYWORD = "delete";

type BulkDeleteDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: string;
  subTitle?: string;
  onDeleteApproved: () => Promise<void>;
  selectedEntries: {
    [EntryType.FOLDER]: Record<string, Record<string, TSecretFolder>>;
    [EntryType.SECRET]: Record<string, Record<string, SecretV3RawSanitized>>;
  };
  visibleEnvs: ProjectEnv[];
  importedBy?: ProjectSecretsImportedBy[] | null;
  secretsToDeleteKeys: string[];
  usedBySecretSyncsFiltered: UsedBySecretSyncs[] | null;
};

const BulkDeleteDialogContent = ({
  title,
  description,
  subTitle,
  onDeleteApproved,
  selectedEntries,
  visibleEnvs,
  importedBy,
  secretsToDeleteKeys,
  usedBySecretSyncsFiltered
}: Omit<BulkDeleteDialogProps, "isOpen">) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const hasAffectedResources =
    (usedBySecretSyncsFiltered && usedBySecretSyncsFiltered.length > 0) ||
    (importedBy &&
      importedBy.some((element) =>
        element.folders.some(
          (folder) =>
            folder.isImported ||
            (folder.secrets?.some((secret) =>
              secretsToDeleteKeys.includes(secret.referencedSecretKey)
            ) ??
              false)
        )
      ));

  const selectedResources = useMemo(() => {
    const items: { type: "folder" | "secret"; name: string; envSlugs: Set<string> }[] = [];

    Object.entries(selectedEntries.folder).forEach(([name, envRecord]) => {
      items.push({
        type: "folder",
        name,
        envSlugs: new Set(Object.keys(envRecord))
      });
    });

    Object.entries(selectedEntries.secret).forEach(([name, envRecord]) => {
      items.push({
        type: "secret",
        name,
        envSlugs: new Set(Object.keys(envRecord))
      });
    });

    return items;
  }, [selectedEntries]);

  const onConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteApproved();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialogContent className="max-w-3xl [&>*]:min-w-0">
      <AlertDialogHeader>
        <AlertDialogTitle className="leading-none font-semibold">{title}</AlertDialogTitle>
        <AlertDialogDescription className="text-accent">{description}</AlertDialogDescription>
        {subTitle && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              <AlertDialogDescription className="text-inherit">{subTitle}</AlertDialogDescription>
            </AlertDescription>
          </Alert>
        )}
      </AlertDialogHeader>

      {selectedResources.length > 0 && (
        <BulkSelectionTable
          action="delete"
          items={selectedResources}
          environments={visibleEnvs}
          containerClassName={hasAffectedResources ? "max-h-[30vh]" : undefined}
        />
      )}

      {hasAffectedResources && (
        <CollapsibleSecretImports
          importedBy={importedBy || []}
          secretsToDelete={secretsToDeleteKeys}
          usedBySecretSyncs={usedBySecretSyncsFiltered}
        />
      )}

      <AlertDialogConfirmationField inputProps={{ placeholder: "Type delete here" }} />

      <AlertDialogFooter>
        <AlertDialogCancel isDisabled={isDeleting}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="danger"
          isPending={isDeleting}
          onClick={(event) => {
            event.preventDefault();
            onConfirmDelete();
          }}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
};

export const BulkDeleteDialog = ({ isOpen, onOpenChange, ...props }: BulkDeleteDialogProps) => {
  return (
    <AlertDialog open={isOpen} confirmationValue={CONFIRMATION_KEYWORD} onOpenChange={onOpenChange}>
      {isOpen && <BulkDeleteDialogContent onOpenChange={onOpenChange} {...props} />}
    </AlertDialog>
  );
};
