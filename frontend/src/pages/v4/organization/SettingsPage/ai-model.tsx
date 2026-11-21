import { useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
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
import type { TAnthropicModel, TOrgAiConfig } from "@app/hooks/api/ai/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";

import { useOrgPermission } from "../../access/permissions";
import { errorMessage, failed, saved as savedToast } from "../../access/toast";
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
              savedToast("AI features turned off");
            }}
          >
            Turn off
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const ConnectionField = ({
  config,
  value,
  canEdit,
  onChange
}: {
  config: TOrgAiConfig | null | undefined;
  value: string;
  canEdit: boolean;
  onChange: (connectionId: string) => void;
}) => {
  const settings = useV4Adapter("orgSettings");
  const createConnection = useV4Adapter("integrations").useCreateConnection();
  const { permission } = useOrgPermission();
  const canCreateConnection = permission.can(
    OrgPermissionAppConnectionActions.Create,
    OrgPermissionSubjects.AppConnections
  );
  const { data: connections = [], isPending } = settings.useAnthropicConnections();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const saved = config ? [{ id: config.connectionId, name: config.connectionName }] : [];
  const options = [...connections, ...(created ? [created] : []), ...saved]
    .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index)
    .map((connection) => ({ value: connection.id, label: connection.name }));
  const creation = connectionCreation({
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
      onChange(connection.id);
      return connection;
    }
  });
  return (
    <Field label="Anthropic connection">
      <Combobox
        label="Anthropic connection"
        placeholder="Select an Anthropic connection"
        options={options}
        value={value}
        loading={isPending}
        disabled={!canEdit}
        creation={canEdit ? creation : undefined}
        onValueChange={onChange}
      />
    </Field>
  );
};

const ModelField = ({
  connectionId,
  value,
  canEdit,
  onChange
}: {
  connectionId: string;
  value: string;
  canEdit: boolean;
  onChange: (model: string) => void;
}) => {
  const { data, isPending, error } = useV4Adapter("orgSettings").useAnthropicModels(connectionId);
  const latest = latestModelPerFamily(data ?? [], value);
  const isKept = !value || !data || latest.some((option) => option.id === value);
  const options = [
    ...latest.map((option) => ({ value: option.id, label: option.displayName })),
    ...(isKept ? [] : [{ value, label: value }])
  ];
  return (
    <Field label="Model" error={error ? modelsErrorText(error) : undefined}>
      <Select
        value={value}
        placeholder={connectionId && isPending ? "Loading models" : "Select a model"}
        disabled={!canEdit || !connectionId || Boolean(error)}
        invalid={Boolean(error)}
        options={options}
        onValueChange={onChange}
      />
    </Field>
  );
};

const turnOffBlock = (canEdit: boolean, saving: boolean) => {
  if (!canEdit) return "Your role doesn't allow editing settings";
  return saving ? "Wait for the model to finish saving" : undefined;
};

const AiModelCard = ({ config, canEdit }: { config: TOrgAiConfig | null; canEdit: boolean }) => {
  const updateConfig = useV4Adapter("orgSettings").useUpdateAiConfig();
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
  return (
    <>
      <SettingsCard
        title="AI features"
        description="Used by AI checks in auto-approval rules."
        saveStatus={autosave.status}
        actions={
          config && (
            <Button
              variant="outline"
              size="sm"
              disabledReason={turnOffBlock(canEdit, autosave.pending)}
              onClick={() => setTurningOff(true)}
            >
              Turn off
            </Button>
          )
        }
      >
        <Stack gap={16}>
          <ConnectionField
            config={config}
            value={connectionId}
            canEdit={canEdit}
            onChange={(next) => autosave.edit({ connectionId: next, model: "" })}
          />
          <ModelField
            connectionId={connectionId}
            value={model}
            canEdit={canEdit}
            onChange={(next) => autosave.save({ connectionId, model: next })}
          />
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

export const OrgAiModel = () => {
  const { permission } = useOrgPermission();
  const { data: config, isPending, error, refetch } = useV4Adapter("orgSettings").useAiConfig();
  if (isPending) return <SettingsCard title="AI features" loading />;
  if (error)
    return (
      <SettingsCard title="AI features">
        <Alert
          tone="bad"
          title="Couldn't load AI features"
          actions={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
      </SettingsCard>
    );
  return (
    <AiModelCard
      config={config ?? null}
      canEdit={permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings)}
    />
  );
};
