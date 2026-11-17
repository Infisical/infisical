import { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import axios from "axios";

import {
  OrgPermissionActions,
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TAnthropicModel } from "@app/hooks/api/ai/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";

import { useOrgPermission } from "../../access/permissions";
import { errorMessage, failed, saved } from "../../access/toast";
import { connectionCreation } from "../../components/app-connection-form";
import { useV4Adapter } from "../../data/adapters";
import { CONNECTION_PRESETS } from "../../data/integrations/connection-presets";

const latestModelPerFamily = (models: TAnthropicModel[], keepId: string) => {
  const newestFirst = [...models].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  );
  const seenFamilies = new Set<string>();
  return newestFirst.filter((model) => {
    if (!model.family) return true;
    const isFirstOfFamily = !seenFamilies.has(model.family);
    seenFamilies.add(model.family);
    return isFirstOfFamily || model.id === keepId;
  });
};

const modelsErrorText = (error: unknown) => {
  const message: unknown = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
  if (typeof message === "string") return message;
  return error instanceof Error
    ? error.message
    : "Couldn't list this connection's models. Check its API key.";
};

type Selection = { connectionId: string; model: string };

const TurnOffDialog = ({
  open,
  onOpenChange,
  onTurnedOff
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTurnedOff: () => void;
}) => {
  const updateConfig = useV4Adapter("orgSettings").useUpdateAiConfig();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText="turn off" pending={updateConfig.isPending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Turn off AI features?</AlertDialogTitle>
          <AlertDialogDescription>
            Every AI check in your auto-approval rules stops passing. Requests those rules would
            have approved wait for approvers, and on policies without approvers they&apos;re
            rejected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              try {
                await updateConfig.mutateAsync({ connectionId: null, model: null });
              } catch (error) {
                failed("Failed to turn off AI features", error);
                return;
              }
              onTurnedOff();
              onOpenChange(false);
              saved("AI features turned off");
            }}
          >
            Turn off
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const OrgAiModel = () => {
  const settings = useV4Adapter("orgSettings");
  const createConnection = useV4Adapter("integrations").useCreateConnection();
  const updateConfig = settings.useUpdateAiConfig();
  const { permission } = useOrgPermission();
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const canCreateConnection = permission.can(
    OrgPermissionAppConnectionActions.Create,
    OrgPermissionSubjects.AppConnections
  );
  const { data: config, isPending } = settings.useAiConfig();
  const { data: connections, isPending: connectionsPending } = settings.useAnthropicConnections();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const storedConnectionId = config?.connectionId ?? "";
  const storedModel = config?.model ?? "";
  const stored = useMemo(
    () => ({ connectionId: storedConnectionId, model: storedModel }),
    [storedConnectionId, storedModel]
  );
  const autosave = useAutosave<Selection>({
    value: stored,
    errorMessage: "Failed to save the AI model",
    onSave: (next) => updateConfig.mutateAsync(next)
  });
  const { connectionId, model } = autosave.value;
  const modelsQuery = settings.useAnthropicModels(connectionId);

  if (isPending) return <SettingsCard title="AI features" loading />;

  const latest = latestModelPerFamily(modelsQuery.data ?? [], model);
  const models =
    model && modelsQuery.data && !latest.some((option) => option.id === model)
      ? [...latest, { id: model, displayName: model, family: null, createdAt: null }]
      : latest;
  const known = [...(connections ?? []), ...(created ? [created] : [])];
  const connectionOptions = [
    ...known,
    ...(config && !known.some((entry) => entry.id === config.connectionId)
      ? [{ id: config.connectionId, name: config.connectionName }]
      : [])
  ]
    .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index)
    .map((connection) => ({ value: connection.id, label: connection.name }));

  const creation = canEdit
    ? connectionCreation({
        preset: CONNECTION_PRESETS[AppConnection.Anthropic],
        disabledReason: canCreateConnection
          ? undefined
          : "Your role doesn't allow creating connections",
        create: async ({ method, name, description, credentials }) => {
          const connection = await createConnection
            .mutateAsync({
              app: AppConnection.Anthropic,
              name,
              method: method as TAppConnection["method"],
              credentials: credentials as TAppConnection["credentials"],
              description: (description as string | undefined)?.trim() || null
            } as TCreateAppConnectionDTO)
            .catch((error: unknown) => {
              throw new Error(errorMessage(error));
            });
          setCreated({ id: connection.id, name: connection.name });
          autosave.edit({ connectionId: connection.id, model: "" });
          return connection;
        }
      })
    : undefined;
  const restricted = canEdit ? undefined : "Your role doesn't allow editing settings";

  return (
    <>
      <SettingsCard
        title="AI features"
        description="The model Infisical uses for AI features, such as AI checks in auto-approval rules."
        saveStatus={autosave.status}
        actions={
          config ? (
            <Button
              variant="outline"
              size="sm"
              disabledReason={restricted}
              onClick={() => setTurningOff(true)}
            >
              Turn off
            </Button>
          ) : undefined
        }
      >
        <Stack gap={16}>
          <Field
            label="Anthropic connection"
            description="An organization-level connection. AI requests are sent with its API key."
          >
            <Combobox
              label="Anthropic connection"
              placeholder="Select an Anthropic connection"
              options={connectionOptions}
              value={connectionId}
              loading={connectionsPending}
              disabled={!canEdit}
              creation={creation}
              onValueChange={(next) => autosave.edit({ connectionId: next, model: "" })}
            />
          </Field>
          <Field
            label="Model"
            error={modelsQuery.error ? modelsErrorText(modelsQuery.error) : undefined}
          >
            <Select
              value={model}
              placeholder={
                connectionId && modelsQuery.isPending ? "Loading models" : "Select a model"
              }
              disabled={!canEdit || !connectionId || Boolean(modelsQuery.error)}
              invalid={Boolean(modelsQuery.error)}
              options={models.map((option) => ({ value: option.id, label: option.displayName }))}
              onValueChange={(next) => autosave.save({ connectionId, model: next })}
            />
          </Field>
        </Stack>
      </SettingsCard>
      <TurnOffDialog
        open={turningOff}
        onOpenChange={setTurningOff}
        onTurnedOff={() => autosave.edit({ connectionId: "", model: "" })}
      />
    </>
  );
};
