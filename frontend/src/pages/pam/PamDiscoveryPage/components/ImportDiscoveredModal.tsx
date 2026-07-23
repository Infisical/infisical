import { useMemo, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  PamAccountType,
  TPamDiscoveredAccount,
  useImportPamDiscoveredAccounts,
  useListPamAccountTemplates,
  useListPamFoldersAdmin,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  accounts: TPamDiscoveredAccount[];
  onImported: () => void;
};

export const ImportDiscoveredModal = ({
  isOpen,
  onOpenChange,
  sourceId,
  accounts,
  onImported
}: Props) => {
  const [folderId, setFolderId] = useState("");

  const [templateByType, setTemplateByType] = useState<Record<string, string>>({});

  const importAccounts = useImportPamDiscoveredAccounts();
  const { data: folders = [] } = useListPamFoldersAdmin();
  const { data: templates = [] } = useListPamAccountTemplates();
  const { map: accountTypeMap } = usePamAccountTypeMap();

  const accountTypes = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.accountType))),
    [accounts]
  );

  const reset = () => {
    setFolderId("");
    setTemplateByType({});
  };

  const handleImport = () => {
    importAccounts.mutate(
      {
        sourceId,
        folderId,
        accounts: accounts.map((a) => ({
          discoveredAccountId: a.id,
          templateId: templateByType[a.accountType]
        }))
      },
      {
        onSuccess: (results) => {
          const imported = results.filter((r) => r.status === "imported").length;
          const failed = results.length - imported;
          createNotification({
            type: failed > 0 ? "info" : "success",
            text: `Imported ${imported} account${imported === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}`
          });
          reset();
          onImported();
          onOpenChange(false);
        }
      }
    );
  };

  const canImport = Boolean(folderId) && accountTypes.every((type) => templateByType[type]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Import {accounts.length} Account{accounts.length === 1 ? "" : "s"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Destination Folder</FieldLabel>
            <FieldContent>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a folder" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>

          {accountTypes.map((type) => {
            const typeName = accountTypeMap[type as PamAccountType]?.name ?? type;
            const matchingTemplates = templates.filter((t) => t.type === type);
            return (
              <Field key={type}>
                <FieldLabel>{typeName} Template</FieldLabel>
                <FieldContent>
                  <Select
                    value={templateByType[type] ?? ""}
                    onValueChange={(value) =>
                      setTemplateByType((prev) => ({ ...prev, [type]: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={`Select a ${typeName} template`} />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {matchingTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            );
          })}

          <p className="text-xs text-muted">
            Imported accounts come in without a credential and stay unusable until one is added.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="pam"
            isDisabled={!canImport}
            isPending={importAccounts.isPending}
            onClick={handleImport}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
