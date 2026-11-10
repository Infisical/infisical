import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Combobox,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import {
  aiQueryKeys,
  TAnthropicModel,
  useGetOrgAiConfig,
  useListAnthropicModels,
  useListOrgAnthropicConnections,
  useUpdateOrgAiConfig
} from "@app/hooks/api/ai";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useOrgConnectionCreation } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

// Older versions of a model line are hidden, but a saved older model stays listed
const getLatestModelPerFamily = (models: TAnthropicModel[], keepId: string) => {
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

export const OrgAiModelSection = () => {
  const queryClient = useQueryClient();
  const { permission } = useOrgPermission();
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

  const { data: config, isPending: isConfigPending } = useGetOrgAiConfig();
  const { data: connections = [], isPending: isConnectionsPending } =
    useListOrgAnthropicConnections();
  const [created, setCreated] = useState<TAvailableAppConnection | null>(null);

  const [connectionId, setConnectionId] = useState("");
  const [model, setModel] = useState("");
  useEffect(() => {
    setConnectionId(config?.connectionId ?? "");
    setModel(config?.model ?? "");
  }, [config]);

  const {
    data: allModels = [],
    isFetching: isModelsLoading,
    isError: isModelsError
  } = useListAnthropicModels(connectionId);
  const models = getLatestModelPerFamily(allModels, model);
  const updateConfig = useUpdateOrgAiConfig();

  const connectionCreation = useOrgConnectionCreation<TAvailableAppConnection>(
    AppConnection.Anthropic,
    (connection) => {
      setCreated({ id: connection.id, name: connection.name, projectId: null });
      setConnectionId(connection.id);
      setModel("");
      queryClient.invalidateQueries({ queryKey: aiQueryKeys.orgAnthropicConnections() });
    }
  );

  const options =
    created && !connections.some((connection) => connection.id === created.id)
      ? [...connections, created]
      : connections;
  const selectedConnection = options.find((connection) => connection.id === connectionId) ?? null;
  const isDirty = connectionId !== (config?.connectionId ?? "") || model !== (config?.model ?? "");

  const save = async () => {
    await updateConfig.mutateAsync({ connectionId, model });
    createNotification({ text: "AI model saved", type: "success" });
  };

  const turnOff = async () => {
    await updateConfig.mutateAsync({ connectionId: null, model: null });
    createNotification({ text: "AI features turned off", type: "success" });
  };

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle>AI Model</CardTitle>
        <CardDescription>
          The model Infisical uses for AI features, such as AI conditions in auto-approval rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-md px-6 pb-6">
        {isConfigPending ? (
          <FieldGroup>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>Anthropic Connection</FieldLabel>
              <Combobox
                isClearable={false}
                isDisabled={!canEdit}
                isLoading={isConnectionsPending}
                value={selectedConnection}
                onValueChange={(option) => {
                  setConnectionId(option.id);
                  setModel("");
                }}
                options={options}
                placeholder="Select an Anthropic connection..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                creation={canEdit ? connectionCreation : undefined}
              />
              <FieldDescription>
                An organization-level connection. AI requests are sent with its API key.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="org-ai-model">Model</FieldLabel>
              <Select
                value={model}
                onValueChange={setModel}
                disabled={!canEdit || !connectionId || isModelsLoading}
              >
                <SelectTrigger id="org-ai-model" className="w-full" isError={isModelsError}>
                  <SelectValue
                    placeholder={isModelsLoading ? "Loading models..." : "Select a model"}
                  />
                </SelectTrigger>
                <SelectContent position="popper">
                  {models.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isModelsError && (
                <FieldDescription className="text-danger">
                  Couldn&apos;t list this connection&apos;s models. Check its API key.
                </FieldDescription>
              )}
            </Field>
          </FieldGroup>
        )}
      </CardContent>
      <CardFooter className="min-h-8 justify-end gap-2 border-t border-neutral/15 bg-neutral/5 p-4">
        {config && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            isDisabled={!canEdit || updateConfig.isPending}
            onClick={turnOff}
          >
            Turn Off
          </Button>
        )}
        <Button
          variant="org"
          size="sm"
          type="button"
          isPending={updateConfig.isPending}
          isDisabled={!canEdit || !isDirty || !connectionId || !model}
          onClick={save}
        >
          Save Changes
        </Button>
      </CardFooter>
    </Card>
  );
};
