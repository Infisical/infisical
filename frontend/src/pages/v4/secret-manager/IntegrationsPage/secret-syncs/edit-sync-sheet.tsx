import { useState } from "react";
import {
  type FieldErrors,
  type FieldValues,
  FormProvider,
  useForm,
  useWatch
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { UpdateSecretSyncFormSchema } from "@app/components/secret-syncs/forms/schemas";
import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import { Alert } from "@app/components/v4/ui/alert";
import { DiscardChangesAlertDialog } from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { SECRET_SYNC_CONNECTION_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";

import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import {
  DetailsFields,
  InitialSyncFields,
  OptionsFields,
  SourceFields
} from "../../OverviewPage/secrets/secret-sync/create-secret-sync-sheet";
import { SyncConnections } from "../../OverviewPage/secrets/secret-sync/sync-fields";
import type { LocalSyncConnection } from "../../OverviewPage/secrets/secret-sync/sync-model";
import { SYNC_VIEWS } from "../../OverviewPage/secrets/secret-sync/sync-views";
import { destinationNameOf } from "./model";

import flowStyles from "../../OverviewPage/secrets/flows/flows.module.css";

export type EditSection = "source" | "destination" | "options" | "details";

const SECTION_TITLE: Record<EditSection, string> = {
  source: "Edit source",
  destination: "Edit destination",
  options: "Edit sync options",
  details: "Edit details"
};

const SECTION_FIELDS: Record<EditSection, string[]> = {
  source: ["environment", "secretPath", "syncOptions"],
  destination: ["connection", "destinationConfig"],
  options: ["syncOptions", "isAutoSyncEnabled"],
  details: ["name", "description"]
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

export const EditSyncSheet = ({
  sync,
  section,
  environments,
  onClose
}: {
  sync: TSecretSync;
  section: EditSection;
  environments: readonly { id: string; name: string; slug: string }[];
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("secrets");
  const update = adapter.useUpdateSecretSync();
  const [added, setAdded] = useState<LocalSyncConnection[]>([]);
  const app = SECRET_SYNC_CONNECTION_MAP[sync.destination];
  const loaded = adapter.useSyncConnections(app, sync.projectId, {
    enabled: section === "destination"
  }).data;
  const form = useForm<FieldValues>({
    resolver: zodResolver(UpdateSecretSyncFormSchema),
    mode: "onChange",
    defaultValues: {
      ...sync,
      environment: sync.environment ?? undefined,
      secretPath: sync.folder?.path,
      description: sync.description ?? "",
      syncOptions: { ...sync.syncOptions, includeAllSubFolders: sync.includeAllSubFolders }
    }
  });
  const { isDirty } = form.formState;
  const [pending, setPending] = useState(false);
  const guard = useDiscardChangesGuard({ isDirty, onDiscard: onClose });
  const name = destinationNameOf(sync.destination);
  const { Destination } = SYNC_VIEWS[sync.destination];

  const connections = [
    { id: sync.connection.id, name: sync.connection.name, app },
    ...(loaded ?? []).map((connection) => ({ id: connection.id, name: connection.name, app })),
    ...added
  ];

  const submit = async (data: FieldValues) => {
    setPending(true);
    try {
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
    } catch (error) {
      failed(`Couldn't update ${sync.name}`, error);
      setPending(false);
      return;
    }
    saved(`Updated ${data.name}`);
    onClose();
  };

  const save = async () => {
    if (!(await form.trigger(SECTION_FIELDS[section]))) return;
    await form.handleSubmit(submit, (errors) =>
      failed("Some sync settings are invalid", new Error(firstError(errors)))
    )();
  };

  let body = <DetailsFields />;
  if (section === "source") body = <SourceFields environments={[...environments]} conflicts={[]} />;
  if (section === "options")
    body = (
      <>
        {!sync.lastSyncedAt && <InitialSyncFields />}
        <OptionsFields />
      </>
    );
  if (section === "destination")
    body = (
      <>
        <Destination />
        <DuplicateWarning sync={sync} />
      </>
    );

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
                  disabledReason={isDirty ? undefined : "No changes to save"}
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
