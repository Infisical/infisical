import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

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
  FieldError,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton
} from "@app/components/v3";
import { ConfirmationAlertDialog } from "@app/components/v3/platform";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import {
  TAnthropicModel,
  useGetOrgAiConfig,
  useListAnthropicModels,
  useListOrgAnthropicConnections,
  useUpdateOrgAiConfig
} from "@app/hooks/api/ai";
import { appConnectionKeys, TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useOrgConnectionCreation } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

const formSchema = z.object({
  connectionId: z.string().min(1, "Choose an Anthropic connection"),
  model: z.string().min(1, "Choose a model")
});

type FormData = z.infer<typeof formSchema>;

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
  const [isTurnOffOpen, setIsTurnOffOpen] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { connectionId: "", model: "" }
  });
  useEffect(() => {
    reset({ connectionId: config?.connectionId ?? "", model: config?.model ?? "" });
  }, [config]);
  const connectionId = watch("connectionId");
  const model = watch("model");

  const {
    data: allModels = [],
    isFetching: isModelsLoading,
    isError: isModelsError
  } = useListAnthropicModels(connectionId);
  const latestModels = getLatestModelPerFamily(allModels, model);
  const models =
    model && !latestModels.some((option) => option.id === model)
      ? [...latestModels, { id: model, displayName: model, family: null, createdAt: null }]
      : latestModels;
  const updateConfig = useUpdateOrgAiConfig();

  const connectionCreation = useOrgConnectionCreation<TAvailableAppConnection>(
    AppConnection.Anthropic,
    (connection) => {
      setCreated({ id: connection.id, name: connection.name, projectId: null });
      setValue("connectionId", connection.id, { shouldDirty: true });
      setValue("model", "", { shouldDirty: true });
      queryClient.invalidateQueries({
        queryKey: appConnectionKeys.listAvailable(AppConnection.Anthropic)
      });
    }
  );

  const options =
    created && !connections.some((connection) => connection.id === created.id)
      ? [...connections, created]
      : connections;
  const selectedConnection = options.find((connection) => connection.id === connectionId) ?? null;

  const onSubmit = async (data: FormData) => {
    await updateConfig.mutateAsync(data);
    createNotification({ text: "AI model saved", type: "success" });
  };

  const turnOff = async () => {
    await updateConfig.mutateAsync({ connectionId: null, model: null });
    setIsTurnOffOpen(false);
    createNotification({ text: "AI features turned off", type: "success" });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
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
              <Controller
                control={control}
                name="connectionId"
                render={({ fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Anthropic Connection</FieldLabel>
                    <Combobox
                      isClearable={false}
                      isDisabled={!canEdit}
                      isLoading={isConnectionsPending}
                      isError={Boolean(error)}
                      value={selectedConnection}
                      onValueChange={(option) => {
                        setValue("connectionId", option.id, { shouldDirty: true });
                        setValue("model", "", { shouldDirty: true });
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
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="model"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="org-ai-model">Model</FieldLabel>
                    <Select
                      value={value}
                      onValueChange={onChange}
                      disabled={!canEdit || !connectionId || isModelsLoading}
                    >
                      <SelectTrigger
                        id="org-ai-model"
                        className="w-full"
                        isError={isModelsError || Boolean(error)}
                      >
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
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
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
              onClick={() => setIsTurnOffOpen(true)}
            >
              Turn Off
            </Button>
          )}
          <Button
            variant="org"
            size="sm"
            type="submit"
            isPending={updateConfig.isPending}
            isDisabled={!canEdit || !isDirty}
          >
            Save Changes
          </Button>
        </CardFooter>
      </Card>
      <ConfirmationAlertDialog
        isOpen={isTurnOffOpen}
        onOpenChange={setIsTurnOffOpen}
        title="Turn Off AI Features"
        description="Every AI condition in your auto-approval rules will stop passing. Requests those rules would have approved will wait for approvers, and on policies without approvers they'll be rejected."
        confirmKey="turn off"
        confirmLabel="Turn Off"
        isPending={updateConfig.isPending}
        onConfirm={turnOff}
      />
    </form>
  );
};
