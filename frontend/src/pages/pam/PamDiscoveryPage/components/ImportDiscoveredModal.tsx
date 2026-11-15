import { useMemo, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@app/components/v3";
import {
  buildPamAccountCan,
  isRotatablePamAccountType,
  PamAccountAccessibilityIssue,
  PamAccountType,
  PamResourcePermissionActions,
  PamRotationStatus,
  TImportPamDiscoveredAccountResult,
  TPamDiscoveredAccount,
  useImportPamDiscoveredAccounts,
  useListPamAccounts,
  useListPamAccountTemplates,
  useListPamFolders,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

const MAX_ROTATIONS_PER_IMPORT = 50;

const MAX_LISTED_ROTATION_FAILURES = 5;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  credentialAccountId?: string;
  accounts: TPamDiscoveredAccount[];
  onImported: (discoveredAccountIds: string[]) => void;
};

export const ImportDiscoveredModal = ({
  isOpen,
  onOpenChange,
  sourceId,
  credentialAccountId,
  accounts,
  onImported
}: Props) => {
  const [folderId, setFolderId] = useState("");

  const [templateByType, setTemplateByType] = useState<Record<string, string>>({});
  const [rotateOnImport, setRotateOnImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // null is a cleared selection; a type with no entry falls back to the source's credential account
  const [rotationAccountByType, setRotationAccountByType] = useState<Record<string, string | null>>(
    {}
  );

  const importAccounts = useImportPamDiscoveredAccounts();
  const { data: folders = [] } = useListPamFolders();
  const { data: templates = [] } = useListPamAccountTemplates();
  const { data: pamAccounts = [] } = useListPamAccounts();
  const { map: accountTypeMap } = usePamAccountTypeMap();

  const accountTypes = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.accountType))),
    [accounts]
  );
  const rotatableTypes = accountTypes.filter(isRotatablePamAccountType);
  const isRotating = rotateOnImport && rotatableTypes.length > 0;

  // setting a rotation account needs a stored password on it and permission to view that password
  const credentialCandidates = useMemo(
    () =>
      pamAccounts.filter(
        (a) =>
          !a.accessibilityIssues.includes(PamAccountAccessibilityIssue.NoCredential) &&
          buildPamAccountCan(a.permissions)(PamResourcePermissionActions.ViewCredentials)
      ),
    [pamAccounts]
  );
  const rotationCandidates = (type: string) =>
    credentialCandidates.filter((a) => a.accountType === type);

  const rotationAccountIdFor = (type: string) => {
    const selected = rotationAccountByType[type];
    if (selected !== undefined) return selected;
    return rotationCandidates(type).some((a) => a.id === credentialAccountId)
      ? (credentialAccountId ?? null)
      : null;
  };

  const reset = () => {
    setFolderId("");
    setTemplateByType({});
    setRotateOnImport(false);
    setRotationAccountByType({});
  };

  const handleImport = async () => {
    const items = accounts.map((a) => {
      const rotationAccountId =
        isRotating && isRotatablePamAccountType(a.accountType)
          ? rotationAccountIdFor(a.accountType)
          : null;
      return {
        discoveredAccountId: a.id,
        templateId: templateByType[a.accountType],
        ...(rotationAccountId ? { rotationAccountId } : {})
      };
    });
    const batches = isRotating
      ? Array.from({ length: Math.ceil(items.length / MAX_ROTATIONS_PER_IMPORT) }, (_, i) =>
          items.slice(i * MAX_ROTATIONS_PER_IMPORT, (i + 1) * MAX_ROTATIONS_PER_IMPORT)
        )
      : [items];

    const results: TImportPamDiscoveredAccountResult[] = [];
    let isComplete = false;
    setIsImporting(true);
    try {
      for (const batch of batches) {
        // eslint-disable-next-line no-await-in-loop
        const batchResults = await importAccounts.mutateAsync({
          sourceId,
          folderId,
          accounts: batch
        });
        results.push(...batchResults);
      }
      isComplete = true;
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    } finally {
      setIsImporting(false);
    }
    if (results.length === 0) return;

    const imported = results.filter((r) => r.status === "imported").length;
    const failed = results.length - imported;
    const rotationFailures = results.filter((r) => r.rotationStatus === PamRotationStatus.Failed);
    const summary = `Imported ${imported} account${imported === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}`;
    const failureLines = rotationFailures
      .slice(0, MAX_LISTED_ROTATION_FAILURES)
      .map((r) => `${r.name ?? r.discoveredAccountId}: ${r.rotationMessage}`);
    if (rotationFailures.length > MAX_LISTED_ROTATION_FAILURES) {
      failureLines.push(`and ${rotationFailures.length - MAX_LISTED_ROTATION_FAILURES} more`);
    }
    createNotification({
      type: failed > 0 || rotationFailures.length > 0 ? "info" : "success",
      ...(rotationFailures.length > 0
        ? {
            title: `${summary}. ${rotationFailures.length} could not be rotated`,
            text: failureLines.join("\n")
          }
        : { text: summary })
    });
    // earlier batches already went through, so drop them from the selection and keep the rest for a retry
    onImported(results.filter((r) => r.status === "imported").map((r) => r.discoveredAccountId));
    if (!isComplete) return;
    reset();
    onOpenChange(false);
  };

  const canImport = Boolean(folderId) && accountTypes.every((type) => templateByType[type]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" isPending={isImporting}>
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

          {rotatableTypes.length > 0 && (
            <Field>
              <div className="flex items-center justify-between gap-4">
                <FieldLabel htmlFor="rotate-on-import" className="mb-0">
                  Rotate account passwords on import
                </FieldLabel>
                <Toggle
                  id="rotate-on-import"
                  variant="pam"
                  checked={rotateOnImport}
                  onCheckedChange={setRotateOnImport}
                />
              </div>
            </Field>
          )}

          {isRotating &&
            rotatableTypes.map((type) => {
              const typeName = accountTypeMap[type as PamAccountType]?.name ?? type;
              const candidates = rotationCandidates(type);
              const selectedId = rotationAccountIdFor(type);
              return (
                <Field key={`rotation-${type}`}>
                  <FieldLabel htmlFor={`rotation-account-${type}`}>
                    {typeName} Rotation Account
                  </FieldLabel>
                  <FieldContent>
                    <Combobox
                      id={`rotation-account-${type}`}
                      value={candidates.find((a) => a.id === selectedId) ?? null}
                      onValueChange={(val) =>
                        setRotationAccountByType((prev) => ({ ...prev, [type]: val?.id ?? null }))
                      }
                      options={candidates}
                      getOptionValue={(a) => a.id}
                      getOptionLabel={(a) =>
                        a.folderName ? `${a.folderName} / ${a.name}` : a.name
                      }
                      placeholder={`Select a ${typeName} account`}
                    />
                    <FieldDescription>
                      Only accounts whose credentials you can view are listed.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              );
            })}

          <p className="text-xs text-muted">
            {isRotating
              ? "A rotation account can only rotate accounts on its own host or domain. Accounts with no rotation account come in without a credential."
              : `Imported accounts come in without a credential and stay unusable until one is added${rotatableTypes.length > 0 ? " or their password is rotated" : ""}.`}
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
            isPending={isImporting}
            onClick={handleImport}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
