import { type ReactNode, useId, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { z } from "zod";

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

const envKeySchema = z.object({
  decryptionKey: z.string().min(1, { message: "Encryption key is required" }),
  file: z.instanceof(File, { message: "Choose an EnvKey export file" })
});

type EnvKeyDraft = { decryptionKey: string; file?: File };

export const EnvKeyImportSheet = ({ onClose }: { onClose: () => void }) => {
  const importEnvKey = useV4Adapter("integrations").useImportEnvKey();
  const formId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting }
  } = useForm<EnvKeyDraft>({
    resolver: zodResolver(envKeySchema),
    defaultValues: { decryptionKey: "", file: undefined }
  });
  const file = useWatch({ control, name: "file" });

  const submit = handleSubmit(async ({ decryptionKey, file: exportFile }) => {
    if (!exportFile) return;
    try {
      await importEnvKey.mutateAsync({ file: exportFile, decryptionKey });
      importStarted();
      onClose();
    } catch (error) {
      failed("Failed to start the EnvKey import", error);
    }
  });

  return (
    <MigrationSheet
      title="Import from EnvKey"
      formId={formId}
      pending={isSubmitting}
      dirty={isDirty}
      blocked={file ? undefined : "Choose an EnvKey export file"}
      onClose={onClose}
    >
      <form id={formId} noValidate autoComplete="off" onSubmit={submit}>
        <Stack gap={16}>
          <Controller
            control={control}
            name="decryptionKey"
            render={({ field, fieldState: { error } }) => (
              <Field label="Encryption key" error={error?.message}>
                <SecretInput
                  value={field.value}
                  invalid={Boolean(error)}
                  autoComplete="new-password"
                  onChange={field.onChange}
                />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="file"
            render={({ field }) => (
              <Field label="Export file">
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  onChange={(event) => {
                    const next = event.target.files?.[0];
                    if (next) field.onChange(next);
                    const input = event.target;
                    input.value = "";
                  }}
                />
                {field.value ? (
                  <Inline gap={8} align="center" justify="between" wrap={false}>
                    <Meta>{field.value.name}</Meta>
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
                      if (next) field.onChange(next);
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
            )}
          />
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

const vaultSchema = z.object({
  gatewayId: z.string(),
  vaultUrl: z.string().trim().min(1, { message: "Vault URL is required" }),
  vaultNamespace: z.string().trim(),
  vaultAccessToken: z.string().min(1, { message: "Access token is required" }),
  mappingType: z.nativeEnum(VaultMappingType)
});

type VaultDraft = z.infer<typeof vaultSchema>;

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
  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting }
  } = useForm<VaultDraft>({ resolver: zodResolver(vaultSchema), defaultValues: EMPTY_VAULT });

  const submit = handleSubmit(async (draft) => {
    try {
      await importVault.mutateAsync({
        vaultUrl: draft.vaultUrl,
        vaultNamespace: draft.vaultNamespace || undefined,
        vaultAccessToken: draft.vaultAccessToken,
        mappingType: draft.mappingType,
        ...(draft.gatewayId !== INTERNET_GATEWAY && { gatewayId: draft.gatewayId })
      });
      importStarted();
      onClose();
    } catch (error) {
      failed("Failed to start the Vault import", error);
    }
  });

  return (
    <MigrationSheet
      title="Import from HCP Vault"
      formId={formId}
      pending={isSubmitting}
      dirty={isDirty}
      onClose={onClose}
    >
      <form id={formId} noValidate autoComplete="off" onSubmit={submit}>
        <Stack gap={16}>
          <Alert tone="info">
            Imports static secrets from the KV secret engine in Vault Dedicated or self-hosted
            Vault.
          </Alert>
          <Controller
            control={control}
            name="gatewayId"
            render={({ field }) => (
              <Field label="Gateway" optional>
                <Gate
                  allowed={canAttachGateway}
                  reason="You don't have permission to attach gateways to resources"
                >
                  <Select
                    aria-label="Gateway"
                    value={field.value}
                    disabled={!canAttachGateway || gatewaysPending}
                    onValueChange={field.onChange}
                    placeholder={gatewaysPending ? "Loading gateways" : undefined}
                    options={[
                      { value: INTERNET_GATEWAY, label: "Internet gateway" },
                      ...gateways.map((gateway) => ({ value: gateway.id, label: gateway.name }))
                    ]}
                  />
                </Gate>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="vaultUrl"
            render={({ field, fieldState: { error } }) => (
              <Field label="Vault URL" error={error?.message}>
                <Input
                  {...field}
                  mono
                  invalid={Boolean(error)}
                  placeholder="https://vault.example.com"
                />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="vaultNamespace"
            render={({ field }) => (
              <Field label="Vault namespace" optional>
                <Input {...field} mono placeholder="admin" />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="vaultAccessToken"
            render={({ field, fieldState: { error } }) => (
              <Field label="Vault access token" error={error?.message}>
                <SecretInput
                  value={field.value}
                  invalid={Boolean(error)}
                  autoComplete="new-password"
                  onChange={field.onChange}
                />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="mappingType"
            render={({ field }) => (
              <Field label="Project mapping" group>
                <RadioGroup
                  value={field.value}
                  onValueChange={(value) => field.onChange(value as VaultMappingType)}
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
            )}
          />
        </Stack>
      </form>
    </MigrationSheet>
  );
};
