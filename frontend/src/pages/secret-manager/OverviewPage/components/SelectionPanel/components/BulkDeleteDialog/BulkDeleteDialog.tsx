import { useMemo, useState } from "react";
import { FolderIcon, KeyIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ProjectSecretsImportedBy, UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { SecretV3RawSanitized, TSecretFolder } from "@app/hooks/api/types";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";

import { EntryType } from "../../SelectionPanel";

type BulkDeleteDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
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
  subTitle,
  onDeleteApproved,
  selectedEntries,
  visibleEnvs,
  importedBy,
  secretsToDeleteKeys,
  usedBySecretSyncsFiltered
}: Omit<BulkDeleteDialogProps, "isOpen">) => {
  const [confirmText, setConfirmText] = useState("");
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
    if (confirmText !== "delete") return;
    setIsDeleting(true);
    try {
      await onDeleteApproved();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DialogContent className="max-w-7xl">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {subTitle && <DialogDescription>{subTitle}</DialogDescription>}
      </DialogHeader>

      {selectedResources.length > 0 && (
        <Table
          containerClassName={twMerge(
            "overflow-auto",
            hasAffectedResources ? "max-h-[30vh]" : "max-h-[60vh]"
          )}
        >
          <TableHeader className="sticky -top-px z-20 bg-container [&_tr]:border-b-0">
            <TableRow>
              <TableHead className="sticky left-0 z-20 w-10 max-w-10 min-w-10 border-b-0 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Type
              </TableHead>
              <TableHead className="sticky left-10 z-20 max-w-[30vw] min-w-[30vw] border-b-0 bg-container shadow-[inset_-1px_0_0_var(--color-border),inset_0_-1px_0_var(--color-border)]">
                Name
              </TableHead>
              {visibleEnvs.map((env) => (
                <TableHead
                  key={env.slug}
                  className="w-32 max-w-32 border-r border-b-0 text-center shadow-[inset_0_-1px_0_var(--color-border)] last:border-r-0"
                  isTruncatable
                >
                  {env.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedResources.map((item) => (
              <TableRow key={`${item.type}-${item.name}`} className="group">
                <TableCell className="sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover">
                  {item.type === "folder" ? (
                    <FolderIcon className="size-4 text-folder" />
                  ) : (
                    <KeyIcon className="size-4 text-secret" />
                  )}
                </TableCell>
                <TableCell
                  className="sticky left-10 z-10 max-w-80 bg-container shadow-[inset_-1px_0_0_var(--color-border)] transition-colors duration-75 group-hover:bg-container-hover"
                  isTruncatable
                >
                  {item.name}
                </TableCell>
                {visibleEnvs.map((env) => (
                  <TableCell key={env.slug} className="border-r text-center last:border-r-0">
                    {item.envSlugs.has(env.slug) ? (
                      <TrashIcon className="inline-block size-4 text-danger" />
                    ) : (
                      <span className="text-muted">&mdash;</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {hasAffectedResources && (
        <CollapsibleSecretImports
          importedBy={importedBy || []}
          secretsToDelete={secretsToDeleteKeys}
          usedBySecretSyncs={usedBySecretSyncsFiltered}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirmDelete();
        }}
      >
        <Field>
          <FieldLabel>
            Type <span className="font-bold">delete</span> to perform this action
          </FieldLabel>
          <FieldContent>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type delete here"
              autoComplete="off"
            />
          </FieldContent>
        </Field>
      </form>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button
          variant="danger"
          isDisabled={confirmText !== "delete" || isDeleting}
          isPending={isDeleting}
          onClick={onConfirmDelete}
        >
          Delete
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const BulkDeleteDialog = ({ isOpen, onOpenChange, ...props }: BulkDeleteDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {isOpen && <BulkDeleteDialogContent onOpenChange={onOpenChange} {...props} />}
    </Dialog>
  );
};
