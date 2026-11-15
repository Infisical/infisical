import { useMemo, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";

import {
  buildPamAccountCan,
  isRotatablePamAccountType,
  PamAccountAccessibilityIssue,
  PamResourcePermissionActions,
  PamRotationStatus,
  type TImportPamDiscoveredAccountResult,
  type TPamDiscoveredAccount
} from "@app/hooks/api/pam";

import { failed, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { accountLabel } from "./source-form";

const MAX_ROTATIONS_PER_IMPORT = 50;
const MAX_LISTED_ROTATION_FAILURES = 5;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

const ImportForm = ({
  sourceId,
  credentialAccountId,
  accounts,
  onImported,
  onClose
}: {
  sourceId: string;
  credentialAccountId?: string;
  accounts: TPamDiscoveredAccount[];
  onImported: (discoveredAccountIds: string[]) => void;
  onClose: () => void;
}) => {
  const pam = useV4Adapter("pam");
  const importAccounts = pam.useImportDiscoveredAccounts();
  const { data: folders = [] } = pam.useFolders();
  const { data: templates = [] } = pam.useTemplates();
  const { data: pamAccounts = [] } = pam.useAccounts();
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const [folderId, setFolderId] = useState("");
  const [templateByType, setTemplateByType] = useState<Record<string, string>>({});
  const [rotateOnImport, setRotateOnImport] = useState(false);
  const [rotationAccountByType, setRotationAccountByType] = useState<Record<string, string | null>>(
    {}
  );
  const [importing, setImporting] = useState(false);

  const typeName = (type: string) => accountTypes.find((meta) => meta.type === type)?.name ?? type;
  const types = useMemo(
    () => Array.from(new Set(accounts.map((entry) => entry.accountType))),
    [accounts]
  );
  const rotatableTypes = types.filter(isRotatablePamAccountType);
  const isRotating = rotateOnImport && rotatableTypes.length > 0;
  const credentialCandidates = useMemo(
    () =>
      pamAccounts.filter(
        (entry) =>
          !entry.accessibilityIssues.includes(PamAccountAccessibilityIssue.NoCredential) &&
          buildPamAccountCan(entry.permissions)(PamResourcePermissionActions.ViewCredentials)
      ),
    [pamAccounts]
  );
  const rotationCandidates = (type: string) =>
    credentialCandidates.filter((entry) => entry.accountType === type);
  const rotationAccountIdFor = (type: string) => {
    const selected = rotationAccountByType[type];
    if (selected !== undefined) return selected;
    return rotationCandidates(type).some((entry) => entry.id === credentialAccountId)
      ? (credentialAccountId ?? null)
      : null;
  };

  const missingTemplate = types.find((type) => !templateByType[type]);
  let blockedReason: string | undefined;
  if (!folderId) blockedReason = "Select a destination folder";
  else if (missingTemplate) blockedReason = `Select a ${typeName(missingTemplate)} template`;

  const handleImport = async () => {
    const items = accounts.map((entry) => {
      const rotationAccountId =
        isRotating && isRotatablePamAccountType(entry.accountType)
          ? rotationAccountIdFor(entry.accountType)
          : null;
      return {
        discoveredAccountId: entry.id,
        templateId: templateByType[entry.accountType],
        ...(rotationAccountId ? { rotationAccountId } : {})
      };
    });
    const batches = isRotating
      ? Array.from({ length: Math.ceil(items.length / MAX_ROTATIONS_PER_IMPORT) }, (_, index) =>
          items.slice(index * MAX_ROTATIONS_PER_IMPORT, (index + 1) * MAX_ROTATIONS_PER_IMPORT)
        )
      : [items];

    const results: TImportPamDiscoveredAccountResult[] = [];
    let isComplete = false;
    setImporting(true);
    try {
      /* oxlint-disable no-await-in-loop -- each batch caps how many rotations one request runs, so batches run one after another */
      for (const batch of batches) {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- each batch caps how many rotations one request runs, so batches run one after another
        const batchResults = await importAccounts.mutateAsync({
          sourceId,
          folderId,
          accounts: batch
        });
        results.push(...batchResults);
      }
      /* oxlint-enable no-await-in-loop */
      isComplete = true;
    } catch (error) {
      failed("Could not import the accounts", error);
    } finally {
      setImporting(false);
    }
    if (results.length === 0) return;

    const imported = results.filter((result) => result.status === "imported");
    const failedCount = results.length - imported.length;
    const rotationFailures = results.filter(
      (result) => result.rotationStatus === PamRotationStatus.Failed
    );
    const summary = `Imported ${plural(imported.length, "account")}${failedCount > 0 ? `, ${failedCount} failed` : ""}`;
    const failureLines = rotationFailures
      .slice(0, MAX_LISTED_ROTATION_FAILURES)
      .map((result) => `${result.name ?? result.discoveredAccountId}: ${result.rotationMessage}`);
    if (rotationFailures.length > MAX_LISTED_ROTATION_FAILURES)
      failureLines.push(`and ${rotationFailures.length - MAX_LISTED_ROTATION_FAILURES} more`);
    toast({
      tone: failedCount > 0 || rotationFailures.length > 0 ? "neutral" : "ok",
      title: rotationFailures.length
        ? `${summary}. ${rotationFailures.length} could not be rotated`
        : summary,
      description: rotationFailures.length ? failureLines.join("\n") : undefined
    });
    onImported(imported.map((result) => result.discoveredAccountId));
    if (isComplete) onClose();
  };

  let footnote = `Imported accounts come in without a credential and stay unusable until one is added${rotatableTypes.length > 0 ? " or their password is rotated" : ""}.`;
  if (isRotating)
    footnote =
      "A rotation account can only rotate accounts on its own host or domain. Accounts with no rotation account come in without a credential.";

  return (
    <DialogContent pending={importing}>
      <DialogHeader>
        <DialogTitle>{`Import ${plural(accounts.length, "account")}`}</DialogTitle>
      </DialogHeader>
      <Stack gap={16}>
        <Field label="Destination folder">
          <Select
            label="Destination folder"
            placeholder="Select a folder"
            value={folderId}
            options={folders.map((entry) => ({ value: entry.id, label: entry.name }))}
            onValueChange={setFolderId}
          />
        </Field>
        {types.map((type) => (
          <Field key={type} label={`${typeName(type)} template`}>
            <Select
              label={`${typeName(type)} template`}
              placeholder={`Select a ${typeName(type)} template`}
              value={templateByType[type] ?? ""}
              options={templates
                .filter((template) => template.type === type)
                .map((template) => ({ value: template.id, label: template.name }))}
              onValueChange={(value) =>
                setTemplateByType((current) => ({ ...current, [type]: value }))
              }
            />
          </Field>
        ))}
        {rotatableTypes.length > 0 && (
          <Switch
            layout="row"
            label="Rotate account passwords on import"
            checked={rotateOnImport}
            onCheckedChange={setRotateOnImport}
          />
        )}
        {isRotating &&
          rotatableTypes.map((type) => (
            <Field
              key={`rotation-${type}`}
              label={`${typeName(type)} rotation account`}
              description="Only accounts whose credentials you can view are listed."
            >
              <Combobox
                label={`${typeName(type)} rotation account`}
                placeholder={`Select a ${typeName(type)} account`}
                clearable
                options={rotationCandidates(type).map((entry) => ({
                  value: entry.id,
                  label: accountLabel(entry)
                }))}
                value={rotationAccountIdFor(type) ?? ""}
                onValueChange={(value) =>
                  setRotationAccountByType((current) => ({ ...current, [type]: value || null }))
                }
              />
            </Field>
          ))}
        <SmallText muted>{footnote}</SmallText>
      </Stack>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="accent"
          loading={importing}
          disabledReason={blockedReason}
          onClick={handleImport}
        >
          Import
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const ImportDialog = ({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceId: string;
  credentialAccountId?: string;
  accounts: TPamDiscoveredAccount[];
  onImported: (discoveredAccountIds: string[]) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <ImportForm {...props} onClose={() => onOpenChange(false)} />}
  </Dialog>
);
