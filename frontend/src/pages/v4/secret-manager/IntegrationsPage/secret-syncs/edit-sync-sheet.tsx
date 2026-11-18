import { useState } from "react";
import {
  type FieldErrors,
  type FieldValues,
  FormProvider,
  useForm,
  useWatch
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Inline } from "@infisical/cipher/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import { UpdateSecretSyncFormSchema } from "@app/components/secret-syncs/forms/schemas";
import { SECRET_SYNC_CONNECTION_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useProjectPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import {
  DetailsFields,
  InitialSyncFields,
  OptionsFields,
  SourceFields,
  useSourceConflicts
} from "../../OverviewPage/secrets/secret-sync/create-secret-sync-sheet";
import {
  canManageFailureAlert,
  FAILURE_ALERT_FIELDS,
  failureAlertDefaults,
  type TSavedFailureAlert,
  useSaveFailureAlert
} from "../../OverviewPage/secrets/secret-sync/failure-alert";
import { FailureAlertFields } from "../../OverviewPage/secrets/secret-sync/failure-alert-fields";
import { SyncConnections } from "../../OverviewPage/secrets/secret-sync/sync-fields";
import type { LocalSyncConnection } from "../../OverviewPage/secrets/secret-sync/sync-model";
import { SYNC_VIEWS } from "../../OverviewPage/secrets/secret-sync/sync-views";
import { destinationNameOf } from "./model";

import flowStyles from "../../OverviewPage/secrets/flows/flows.module.css";

export type EditSection = "source" | "destination" | "options" | "details" | "alerts";

const SECTION_TITLE: Record<EditSection, string> = {
  source: "Edit source",
  destination: "Edit destination",
  options: "Edit sync options",
  details: "Edit details",
  alerts: "Edit failure alert"
};

const SECTION_FIELDS: Record<EditSection, string[]> = {
  source: ["environment", "secretPath", "syncOptions"],
  destination: ["connection", "destinationConfig"],
  options: ["syncOptions", "isAutoSyncEnabled"],
  details: ["name", "description"],
  alerts: FAILURE_ALERT_FIELDS
};

const firstError = (errors: FieldErrors): string | undefined => {
  const entry = Object.values(errors)[0];
  if (!entry) return undefined;
  if (typeof entry.message === "string" && entry.message) return entry.message;
  return firstError(entry as FieldErrors);
};

const DuplicateWarning = ({ sync }: { sync: TSecretSync }) => {
  const [connectionId, destinationConfig] = useWatch({
    name: ["connection.id", "destinationConfig"]
  }) as [string | undefined, unknown];
  const { data } = useV4Adapter("secrets").useSecretSyncDuplicate({
    destination: sync.destination,
    destinationConfig,
    projectId: sync.projectId,
    excludeSyncId: sync.id,
    connectionId
  });
  if (!data?.hasDuplicate) return null;
  return (
    <Alert tone="warn" title="Another sync already writes to this destination">
      Two syncs writing to the same place can overwrite each other.
      {data.duplicateProjectId && (
        <>
          {" "}
          The other sync is in project <code>{data.duplicateProjectId}</code>.
        </>
      )}
    </Alert>
  );
};

const SectionFields = ({
  sync,
  section,
  environments,
  conflicts,
  savedAlertId,
  canManageAlert,
  failureAlertUnavailable
}: {
  sync: TSecretSync;
  section: EditSection;
  environments: readonly { id: string; name: string; slug: string }[];
  conflicts: ReturnType<typeof useSourceConflicts>;
  savedAlertId?: string;
  canManageAlert: boolean;
  failureAlertUnavailable?: boolean;
}) => {
  const { Destination } = SYNC_VIEWS[sync.destination];
  if (section === "alerts")
    return (
      <FailureAlertFields
        projectId={sync.projectId}
        syncId={sync.id}
        alertId={savedAlertId}
        canManage={canManageAlert}
        unavailable={failureAlertUnavailable}
      />
    );
  if (section === "source")
    return <SourceFields environments={[...environments]} conflicts={conflicts} />;
  if (section === "options")
    return (
      <>
        {!sync.lastSyncedAt && <InitialSyncFields />}
        <OptionsFields />
      </>
    );
  if (section === "destination")
    return (
      <>
        <Destination />
        <DuplicateWarning sync={sync} />
      </>
    );
  return <DetailsFields />;
};

export const EditSyncSheet = ({
  sync,
  section,
  environments,
  failureAlert,
  failureAlertUnavailable,
  onClose
}: {
  sync: TSecretSync;
  section: EditSection;
  environments: readonly { id: string; name: string; slug: string }[];
  failureAlert?: TSavedFailureAlert;
  failureAlertUnavailable?: boolean;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("secrets");
  const update = adapter.useUpdateSecretSync();
  const saveFailureAlert = useSaveFailureAlert();
  const { permission } = useProjectPermission(sync.projectId);
  const [savedAlert] = useState(failureAlert);
  const [added, setAdded] = useState<LocalSyncConnection[]>([]);
  const app = SECRET_SYNC_CONNECTION_MAP[sync.destination];
  const loaded = adapter.useSyncConnections(app, sync.projectId, {
    enabled: section === "destination"
  }).data;
  const form = useForm<FieldValues>({
    resolver: zodResolver(UpdateSecretSyncFormSchema(savedAlert)),
    mode: "onChange",
    defaultValues: {
      ...sync,
      environment: sync.environment ?? undefined,
      secretPath: sync.folder?.path,
      description: sync.description ?? "",
      syncOptions: { ...sync.syncOptions, includeAllSubFolders: sync.includeAllSubFolders },
      ...failureAlertDefaults(sync.projectId, savedAlert)
    }
  });
  const { isDirty } = form.formState;
  const values = useWatch({ control: form.control }) as FieldValues;
  const conflicts = useSourceConflicts(sync.projectId, section === "source" ? values : {});
  const [pending, setPending] = useState(false);
  const guard = useDiscardChangesGuard({ isDirty, onDiscard: onClose });
  const name = destinationNameOf(sync.destination);

  const connections = [
    { id: sync.connection.id, name: sync.connection.name, app },
    ...(loaded ?? []).map((connection) => ({ id: connection.id, name: connection.name, app })),
    ...added
  ];

  const canManageAlert = canManageFailureAlert(permission, {
    environment: sync.environment?.slug,
    secretPath: sync.folder?.path,
    connectionId: sync.connection.id
  });

  const submit = async (data: FieldValues) => {
    setPending(true);
    try {
      if (section === "alerts") {
        await saveFailureAlert({
          syncId: sync.id,
          projectId: sync.projectId,
          saved: savedAlert,
          enabled: data.isFailureAlertEnabled,
          channels: data.channels
        });
        saved(`Updated the failure alert for ${sync.name}`);
      } else {
        await update.mutateAsync({
          syncId: sync.id,
          destination: sync.destination,
          projectId: sync.projectId,
          name: data.name,
          description: data.description || null,
          connectionId: data.connection.id,
          environment: data.environment?.slug,
          secretPath: data.secretPath,
          isAutoSyncEnabled: data.isAutoSyncEnabled,
          includeAllSubFolders: Boolean(data.syncOptions?.includeAllSubFolders),
          destinationConfig: data.destinationConfig,
          syncOptions: data.syncOptions
        });
        saved(`Updated ${data.name}`);
      }
      onClose();
    } catch (error) {
      failed(
        section === "alerts"
          ? `Couldn't update the failure alert for ${sync.name}`
          : `Couldn't update ${sync.name}`,
        error
      );
    } finally {
      setPending(false);
    }
  };

  const save = async () => {
    if (conflicts.length) return;
    if (!(await form.trigger(SECTION_FIELDS[section]))) return;
    await form.handleSubmit(submit, (errors) =>
      failed("Some sync settings are invalid", new Error(firstError(errors)))
    )();
  };

  return (
    <SyncConnections
      value={{
        projectId: sync.projectId,
        connections,
        addConnection: (connection) => setAdded((list) => [...list, connection])
      }}
    >
      <FormProvider {...form}>
        <Sheet open onOpenChange={(open) => !open && guard.requestDiscard()}>
          <SheetContent size="lg">
            <SheetHeader>
              <Inline gap={8} align="center" wrap={false}>
                <ProviderIcon icon={SECRET_SYNC_MAP[sync.destination].image} alt={name} size="sm" />
                <SheetTitle>{SECTION_TITLE[section]}</SheetTitle>
              </Inline>
            </SheetHeader>
            <SheetBody>
              <form
                noValidate
                className={flowStyles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <SectionFields
                  sync={sync}
                  section={section}
                  environments={environments}
                  conflicts={conflicts}
                  savedAlertId={savedAlert?.id}
                  canManageAlert={canManageAlert}
                  failureAlertUnavailable={failureAlertUnavailable}
                />
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
                    (conflicts.length > 0 && "Resolve the secret name conflicts first") ||
                    (section === "alerts" &&
                      (failureAlertUnavailable || !canManageAlert) &&
                      "You can't change this sync's failure alert") ||
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
      </FormProvider>
    </SyncConnections>
  );
};
