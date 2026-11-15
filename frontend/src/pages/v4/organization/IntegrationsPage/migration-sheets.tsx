import { type ReactNode, useId, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Meta } from "@infisical/cipher/ui/text";

import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { ExternalMigrationProviders } from "@app/hooks/api/migration/types";

import { useOrgPermission } from "../../access/permissions";
import { failed, toast } from "../../access/toast";
import { Gate } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";

const importStarted = () =>
  toast({
    tone: "neutral",
    title: "Import started",
    description:
      "You'll get an email when the import finishes or fails. It can take up to 10 minutes."
  });

const MigrationSheet = ({
  title,
  formId,
  pending,
  dirty,
  blocked,
  onClose,
  children
}: {
  title: string;
  formId: string;
  pending: boolean;
  dirty: boolean;
  blocked?: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });
  return (
    <>
      <Sheet open onOpenChange={(next) => !next && requestDiscard()}>
        <SheetContent pending={pending}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <SheetBody>{children}</SheetBody>
          <SheetFooter>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              loading={pending}
              disabledReason={blocked}
            >
              Import data
            </Button>
            <Button variant="outline" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Nothing will be imported, and the details you entered will be lost."
      />
    </>
  );
};

export const EnvKeyImportSheet = ({ onClose }: { onClose: () => void }) => {
  const importEnvKey = useV4Adapter("integrations").useImportEnvKey();
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [decryptionKey, setDecryptionKey] = useState("");
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const [keyError, setKeyError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!decryptionKey) {
      setKeyError("Encryption key is required");
      return;
    }
    if (!file) return;
    setPending(true);
    try {
      await importEnvKey.mutateAsync({ file, decryptionKey });
      importStarted();
      onClose();
    } catch (error) {
      failed("Failed to start the EnvKey import", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <MigrationSheet
      title="Import from EnvKey"
      formId={formId}
      pending={pending}
      dirty={Boolean(decryptionKey || file)}
      blocked={file ? undefined : "Choose an EnvKey export file"}
      onClose={onClose}
    >
      <form
        id={formId}
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap={16}>
          <Field label="Encryption key" error={keyError}>
            <SecretInput
              value={decryptionKey}
              invalid={Boolean(keyError)}
              autoComplete="new-password"
              onChange={(value) => {
                setDecryptionKey(value);
                setKeyError(undefined);
              }}
            />
          </Field>
          <Field label="Export file">
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) setFile(next);
                const input = event.target;
                input.value = "";
              }}
            />
            {file ? (
              <Inline gap={8} align="center" justify="between" wrap={false}>
                <Meta>{file.name}</Meta>
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  Replace file
                </Button>
              </Inline>
            ) : (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const next = event.dataTransfer.files[0];
                  if (next) setFile(next);
                }}
              >
                <EmptyState
                  size="sm"
                  icon="upload"
                  title={dragging ? "Drop the file to upload it" : "Drop an EnvKey export here"}
                  actions={
                    <Button variant="outline" onClick={() => fileInput.current?.click()}>
                      Choose file
                    </Button>
                  }
                />
              </div>
            )}
          </Field>
        </Stack>
      </form>
    </MigrationSheet>
  );
};

enum VaultMappingType {
  KeyVault = "key-vault",
  Namespace = "namespace",
  Custom = "custom"
}

const INTERNET_GATEWAY = "__internet__";

type VaultDraft = {
  gatewayId: string;
  vaultUrl: string;
  vaultNamespace: string;
  vaultAccessToken: string;
  mappingType: VaultMappingType;
};

const EMPTY_VAULT: VaultDraft = {
  gatewayId: INTERNET_GATEWAY,
  vaultUrl: "",
  vaultNamespace: "",
  vaultAccessToken: "",
  mappingType: VaultMappingType.KeyVault
};

export const VaultImportSheet = ({ onClose }: { onClose: () => void }) => {
  const integrations = useV4Adapter("integrations");
  const importVault = integrations.useImportVault();
  const { data: gateways = [], isPending: gatewaysPending } = integrations.useMigrationGateways();
  const { data: custom } = integrations.useCustomMigrationAvailable(
    ExternalMigrationProviders.Vault
  );
  const { permission } = useOrgPermission();
  const canAttachGateway = permission.can(
    OrgGatewayPermissionActions.AttachGateways,
    OrgPermissionSubjects.Gateway
  );
  const customEnabled = Boolean(custom?.data?.enabled);
  const formId = useId();
  const [draft, setDraft] = useState(EMPTY_VAULT);
  const [errors, setErrors] = useState<Partial<Record<keyof VaultDraft, string>>>({});
  const [pending, setPending] = useState(false);
  const dirty = (Object.keys(EMPTY_VAULT) as (keyof VaultDraft)[]).some(
    (key) => draft[key] !== EMPTY_VAULT[key]
  );

  const set =
    <K extends keyof VaultDraft>(key: K) =>
    (value: VaultDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({ ...current, [key]: undefined }));
    };

  const submit = async () => {
    const next = {
      vaultUrl: draft.vaultUrl.trim() ? undefined : "Vault URL is required",
      vaultAccessToken: draft.vaultAccessToken ? undefined : "Access token is required"
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setPending(true);
    try {
      await importVault.mutateAsync({
        vaultUrl: draft.vaultUrl.trim(),
        vaultNamespace: draft.vaultNamespace.trim() || undefined,
        vaultAccessToken: draft.vaultAccessToken,
        mappingType: draft.mappingType,
        ...(draft.gatewayId !== INTERNET_GATEWAY && { gatewayId: draft.gatewayId })
      });
      importStarted();
      onClose();
    } catch (error) {
      failed("Failed to start the Vault import", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <MigrationSheet
      title="Import from HCP Vault"
      formId={formId}
      pending={pending}
      dirty={dirty}
      onClose={onClose}
    >
      <form
        id={formId}
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap={16}>
          <Alert tone="info">
            Imports static secrets from the KV secret engine in Vault Dedicated or self-hosted
            Vault.
          </Alert>
          <Field label="Gateway" optional>
            <Gate
              allowed={canAttachGateway}
              reason="You don't have permission to attach gateways to resources"
            >
              <Select
                aria-label="Gateway"
                value={draft.gatewayId}
                disabled={!canAttachGateway || gatewaysPending}
                onValueChange={set("gatewayId")}
                placeholder={gatewaysPending ? "Loading gateways" : undefined}
                options={[
                  { value: INTERNET_GATEWAY, label: "Internet gateway" },
                  ...gateways.map((gateway) => ({ value: gateway.id, label: gateway.name }))
                ]}
              />
            </Gate>
          </Field>
          <Field label="Vault URL" error={errors.vaultUrl}>
            <Input
              mono
              value={draft.vaultUrl}
              invalid={Boolean(errors.vaultUrl)}
              placeholder="https://vault.example.com"
              onChange={(event) => set("vaultUrl")(event.target.value)}
            />
          </Field>
          <Field label="Vault namespace" optional>
            <Input
              mono
              value={draft.vaultNamespace}
              placeholder="admin"
              onChange={(event) => set("vaultNamespace")(event.target.value)}
            />
          </Field>
          <Field label="Vault access token" error={errors.vaultAccessToken}>
            <SecretInput
              value={draft.vaultAccessToken}
              invalid={Boolean(errors.vaultAccessToken)}
              autoComplete="new-password"
              onChange={set("vaultAccessToken")}
            />
          </Field>
          <Field label="Project mapping" group>
            <RadioGroup
              value={draft.mappingType}
              onValueChange={(value) => set("mappingType")(value as VaultMappingType)}
            >
              <RadioGroupCard
                value={VaultMappingType.KeyVault}
                title="Key vaults"
                description="Each KV engine becomes a project with a Production environment. Secret paths become folders."
              />
              <RadioGroupCard
                value={VaultMappingType.Namespace}
                title="Namespaces"
                description="Each namespace becomes a project and each KV engine an environment. Secret paths become folders."
              />
              <RadioGroupCard
                value={VaultMappingType.Custom}
                disabled={!customEnabled}
                title="Custom migration"
                description={
                  customEnabled
                    ? "A mapping shaped to your Vault setup."
                    : "Contact sales to set up a custom mapping for your Vault setup."
                }
              />
            </RadioGroup>
          </Field>
        </Stack>
      </form>
    </MigrationSheet>
  );
};
