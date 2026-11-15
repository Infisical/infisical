import { useState } from "react";
import { type FieldErrors, type FieldPath, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import {
  isPaloAltoNetworksTemplateMissing,
  PALO_ALTO_NETWORKS_TEMPLATE_REQUIRED_MESSAGE
} from "@app/components/pki-syncs/forms/schemas/palo-alto-networks-pki-sync-destination-schema";
import {
  removeUnusedKeystoreOptions,
  type TPkiSyncForm,
  type TUpdatePkiSyncForm,
  UpdatePkiSyncFormSchema
} from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import {
  getCertificateDisplayName,
  isPaloAltoNetworksPkiSync,
  PKI_SYNC_MAP
} from "@app/helpers/pkiSyncs";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type {
  TPkiSync,
  TPkiSyncFilterPreview,
  TPkiSyncRemovalOptions
} from "@app/hooks/api/pkiSyncs/types";

import { failed, saved } from "../../../access/toast";
import { ProviderIcon } from "../../../components/provider-icon";
import { useV4Adapter } from "../../../data/adapters";
import { PkiSyncCertificatesFields } from "./certificates/certificates-fields";
import { PkiSyncDestinationFields } from "./destinations/destination-fields";
import { PkiSyncTargetHostField } from "./destinations/target-host-field";
import { SwitchField } from "./fields";
import { PkiSyncDetailsFields } from "./options/details-fields";
import { PkiSyncFieldMappingsFields } from "./options/field-mappings-fields";
import { PkiSyncHealthCheckCommandFields } from "./options/health-check-command-fields";
import { PkiSyncOptionsFields } from "./options/options-fields";
import { PkiSyncPostSyncCommandFields } from "./options/post-sync-command-fields";
import { destinationNameOf, useCanSetHealthCheckCommand, useCanSetPostSyncCommand } from "./shared";
import type { PkiSyncStepKey } from "./steps";
import {
  arePkiSyncRemovalOptionsComplete,
  hasPkiSyncRemovalOptions,
  PkiSyncRemovalOptionsFields
} from "./sync-parts";

export type PkiSyncEditSection = Exclude<PkiSyncStepKey, "targetHost" | "review">;

const SECTION: Record<PkiSyncEditSection, { title: string; fields: string[] }> = {
  destination: { title: "Edit destination", fields: ["connection", "destinationConfig"] },
  options: {
    title: "Edit sync options",
    fields: ["syncOptions", "credentials", "isAutoSyncEnabled"]
  },
  mappings: { title: "Edit field mappings", fields: ["syncOptions"] },
  hostCommands: {
    title: "Edit commands",
    fields: ["syncOptions.healthCheckCommand", "syncOptions.postSyncCommand"]
  },
  certificates: { title: "Edit certificates", fields: ["filters"] },
  details: { title: "Edit details", fields: ["name", "description"] }
};

const LDAP_TARGET_DEFAULTS = {
  host: undefined,
  port: undefined,
  sslEnabled: undefined,
  sslRejectUnauthorized: undefined,
  sslCertificate: undefined
};

const firstError = (errors: FieldErrors): string | undefined => {
  const entry = Object.values(errors)[0];
  if (!entry) return undefined;
  if (typeof entry.message === "string" && entry.message) return entry.message;
  return firstError(entry as FieldErrors);
};

type PendingUnlink = { preview: TPkiSyncFilterPreview; data: TUpdatePkiSyncForm };

export const EditPkiSyncSheet = ({
  sync,
  section,
  onClose
}: {
  sync: TPkiSync;
  section: PkiSyncEditSection;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("pkiSyncs");
  const update = adapter.useUpdateSync();
  const previewFilters = adapter.usePreviewFilters();
  const canSetPostSyncCommand = useCanSetPostSyncCommand(sync.applicationId);
  const canSetHealthCheckCommand = useCanSetHealthCheckCommand(sync.applicationId);
  const destinationName = destinationNameOf(sync.destination);
  const form = useForm<TUpdatePkiSyncForm>({
    resolver: zodResolver(UpdatePkiSyncFormSchema),
    reValidateMode: "onChange",
    defaultValues: {
      name: sync.name,
      destination: sync.destination,
      description: sync.description ?? "",
      connection: {
        id: sync.connectionId,
        name: sync.appConnectionName ?? sync.connection.name,
        app: sync.connection.app
      },
      syncOptions: sync.syncOptions,
      destinationConfig: { ...LDAP_TARGET_DEFAULTS, ...sync.destinationConfig },
      isAutoSyncEnabled: sync.isAutoSyncEnabled,
      filters: sync.filters ?? null
    } as Partial<TUpdatePkiSyncForm>
  });
  const { isDirty } = form.formState;
  const connection = useWatch({ control: form.control, name: "connection" }) as
    | { id?: string; app?: AppConnection }
    | undefined;
  const { data: paloAltoDevice, isPending: detectingPaloAlto } = adapter.usePaloAltoTemplates(
    connection?.id ?? "",
    { enabled: isPaloAltoNetworksPkiSync(sync.destination) && Boolean(connection?.id) }
  );
  const [pending, setPending] = useState(false);
  const [pendingUnlink, setPendingUnlink] = useState<PendingUnlink>();
  const [removalOptions, setRemovalOptions] = useState<TPkiSyncRemovalOptions>({});
  const guard = useDiscardChangesGuard({ isDirty, onDiscard: onClose });

  const applyUpdate = async (
    { connection: picked, ...data }: TUpdatePkiSyncForm,
    removal?: TPkiSyncRemovalOptions
  ) => {
    const hasNewExportPassword = Boolean(
      (data as { credentials?: { exportPassword?: string } }).credentials?.exportPassword
    );
    setPending(true);
    try {
      await update.mutateAsync({
        syncId: sync.id,
        ...removeUnusedKeystoreOptions(data),
        ...(hasNewExportPassword ? {} : { credentials: undefined }),
        connectionId: picked.id,
        projectId: sync.projectId,
        destination: sync.destination,
        ...(removal ? { removalOptions: removal } : {})
      } as Parameters<typeof update.mutateAsync>[0]);
    } catch (error) {
      failed(`Couldn't update ${sync.name}`, error);
      return;
    } finally {
      setPending(false);
    }
    saved(`${data.name ?? sync.name} updated`);
    onClose();
  };

  const submit = async (data: TUpdatePkiSyncForm) => {
    if (
      isPaloAltoNetworksPkiSync(sync.destination) &&
      isPaloAltoNetworksTemplateMissing(paloAltoDevice?.isPanorama, data.destinationConfig)
    ) {
      form.setError("destinationConfig.template" as FieldPath<TUpdatePkiSyncForm>, {
        type: "manual",
        message: PALO_ALTO_NETWORKS_TEMPLATE_REQUIRED_MESSAGE
      });
      return;
    }
    if (JSON.stringify(data.filters ?? null) !== JSON.stringify(sync.filters ?? null)) {
      setPending(true);
      let preview: TPkiSyncFilterPreview;
      try {
        preview = await previewFilters.mutateAsync({ pkiSyncId: sync.id, filters: data.filters });
      } catch (error) {
        failed("Couldn't check which certificates the new filters match", error);
        return;
      } finally {
        setPending(false);
      }
      if (preview.toUnlink.length > 0) {
        setRemovalOptions({});
        setPendingUnlink({ preview, data });
        return;
      }
    }
    await applyUpdate(data);
  };

  const save = async () => {
    if (!(await form.trigger(SECTION[section].fields as FieldPath<TUpdatePkiSyncForm>[]))) return;
    await form.handleSubmit(submit, (errors) =>
      failed("Some sync settings are invalid", new Error(firstError(errors)))
    )();
  };

  const needsRemovalOptions = Boolean(
    pendingUnlink &&
    hasPkiSyncRemovalOptions(sync.destination) &&
    (pendingUnlink.data.syncOptions as { canRemoveCertificates?: boolean } | undefined)
      ?.canRemoveCertificates &&
    pendingUnlink.preview.toUnlinkAtDestinationCount > 0
  );
  const removalComplete =
    !pendingUnlink ||
    !needsRemovalOptions ||
    arePkiSyncRemovalOptionsComplete(
      sync.destination,
      { remainingCertificateCount: pendingUnlink.preview.matchedCount },
      removalOptions
    );
  const unlinkCount = pendingUnlink?.preview.toUnlink.length ?? 0;

  let body = <PkiSyncDetailsFields />;
  if (section === "destination")
    body = (
      <Stack gap={16}>
        <PkiSyncDestinationFields isUpdate />
        {connection?.app === AppConnection.LDAP && (
          <PkiSyncTargetHostField applicationId={sync.applicationId ?? undefined} />
        )}
      </Stack>
    );
  if (section === "options")
    body = (
      <Stack gap={16}>
        <PkiSyncOptionsFields destination={sync.destination} isUpdate />
        <SwitchField
          name="isAutoSyncEnabled"
          label="Auto-sync on change"
          description="Sync automatically when the certificates this sync holds change. Turn off to sync only manually."
        />
      </Stack>
    );
  if (section === "mappings") body = <PkiSyncFieldMappingsFields destination={sync.destination} />;
  if (section === "hostCommands")
    body = (
      <Stack gap={32}>
        <PkiSyncHealthCheckCommandFields
          destination={sync.destination}
          applicationId={sync.applicationId ?? undefined}
          syncId={sync.id}
          canEditCommand={canSetHealthCheckCommand}
        />
        <PkiSyncPostSyncCommandFields
          destination={sync.destination}
          canEditCommand={canSetPostSyncCommand}
        />
      </Stack>
    );
  if (section === "certificates")
    body = (
      <PkiSyncCertificatesFields
        applicationId={sync.applicationId ?? undefined}
        pkiSyncId={sync.id}
      />
    );

  return (
    <FormProvider {...(form as unknown as ReturnType<typeof useForm<TPkiSyncForm>>)}>
      <Sheet open onOpenChange={(open) => !open && guard.requestDiscard()}>
        <SheetContent size="lg" pending={pending}>
          <SheetHeader>
            <Inline gap={8} align="center" wrap={false}>
              <ProviderIcon icon={PKI_SYNC_MAP[sync.destination].image} alt="" size="sm" />
              <SheetTitle>{SECTION[section].title}</SheetTitle>
            </Inline>
            <SheetDescription>{sync.name}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              {body}
            </form>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end" wrap={false}>
              <Button variant="ghost" onClick={guard.requestDiscard}>
                Cancel
              </Button>
              <Button
                loading={pending}
                disabledReason={
                  (detectingPaloAlto && Boolean(connection?.id) && "Checking the device") ||
                  (isDirty ? undefined : "No changes to save")
                }
                onClick={save}
              >
                Save changes
              </Button>
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved changes to this sync will be lost."
      />
      <AlertDialog
        open={Boolean(pendingUnlink)}
        onOpenChange={(open) => !open && setPendingUnlink(undefined)}
      >
        <AlertDialogContent tone="danger" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unlinkCount} certificate{unlinkCount === 1 ? "" : "s"} will no longer be synced
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <Stack gap={8}>
                  <span>
                    These certificates no longer match the filters, so this sync stops holding them:
                  </span>
                  <ul style={{ maxHeight: 160, overflowY: "auto", margin: 0 }}>
                    {pendingUnlink?.preview.toUnlink.map((certificate) => (
                      <li key={certificate.id}>
                        <code>{getCertificateDisplayName(certificate).originalDisplayName}</code>
                      </li>
                    ))}
                  </ul>
                  {pendingUnlink?.preview.willRemoveFromDestination && (
                    <span>
                      Removal is on for this sync, so they&apos;re also deleted from{" "}
                      {destinationName}.
                    </span>
                  )}
                </Stack>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsRemovalOptions && (
            <PkiSyncRemovalOptionsFields
              sync={sync}
              value={removalOptions}
              onChange={setRemovalOptions}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!removalComplete}
              onClick={(event) => {
                event.preventDefault();
                const current = pendingUnlink;
                setPendingUnlink(undefined);
                if (current)
                  applyUpdate(current.data, needsRemovalOptions ? removalOptions : undefined);
              }}
            >
              Save changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
};
