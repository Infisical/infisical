import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch
} from "@app/components/v3";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import { useGetPamAiInsightsModels } from "@app/hooks/api/pam";

import { SessionRecordingConfig } from "./PamResourceSessionRecordingSection";

// Extend this array as more LLM providers are added
const LLM_APP_CONNECTIONS = [AppConnection.Anthropic] as const;

const DEFAULT_MODEL = "claude-sonnet-4-6";

const formSchema = z.object({
  aiInsightsEnabled: z.boolean(),
  connectionId: z.string().optional(),
  model: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  config: SessionRecordingConfig;
  onSave: (config: SessionRecordingConfig) => void | Promise<void>;
};

export const PamSessionRecordingModal = ({ isOpen, onOpenChange, config, onSave }: Props) => {
  const { data: allConnections = [], isPending } = useListAppConnections(undefined, {
    enabled: isOpen
  });
  const { data: aiModels = [] } = useGetPamAiInsightsModels();

  const llmConnections = allConnections.filter((c) =>
    (LLM_APP_CONNECTIONS as readonly string[]).includes(c.app)
  );

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, dirtyFields }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      aiInsightsEnabled: config?.aiInsightsEnabled ?? false,
      connectionId: config?.connectionId ?? "",
      model: config?.model ?? DEFAULT_MODEL
    }
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        aiInsightsEnabled: config?.aiInsightsEnabled ?? false,
        connectionId: config?.connectionId ?? "",
        model: config?.model ?? DEFAULT_MODEL
      });
    }
  }, [isOpen, config, reset]);

  const aiInsightsEnabled = useWatch({ control, name: "aiInsightsEnabled" });
  const selectedConnectionId = useWatch({ control, name: "connectionId" });
  const selectedConnection = llmConnections.find((c) => c.id === selectedConnectionId);
  const selectedProvider = selectedConnection?.app;
  const availableModels = selectedProvider
    ? aiModels.filter((m) => m.connectionApp === selectedProvider)
    : [];

  // Only reset the model when the user explicitly changes the connection (field is dirty),
  // not when connections load async and selectedProvider goes undefined → defined on open.
  useEffect(() => {
    if (selectedProvider && dirtyFields.connectionId) {
      const firstModel = aiModels.find((m) => m.connectionApp === selectedProvider);
      setValue("model", firstModel?.id ?? DEFAULT_MODEL, { shouldDirty: true });
    }
  }, [selectedProvider, dirtyFields.connectionId, setValue, aiModels]);

  const onSubmit = async (data: FormData) => {
    try {
      if (!data.aiInsightsEnabled) {
        await onSave(null);
      } else {
        await onSave({
          aiInsightsEnabled: true,
          connectionId: data.connectionId ?? "",
          connectionName: selectedConnection?.name ?? data.connectionId ?? "",
          model: data.model ?? DEFAULT_MODEL
        });
      }
      onOpenChange(false);
    } catch {
      createNotification({ type: "error", text: "Failed to update session recording settings" });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit Session Recording</SheetTitle>
          <SheetDescription>
            Configure session recording settings for this resource.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
          {/* AI Insights section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Label>AI Insights</Label>
                <p className="text-xs text-muted">
                  Summarize session activity using an AI connection
                </p>
              </div>
              <Controller
                name="aiInsightsEnabled"
                control={control}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    variant="success"
                  />
                )}
              />
            </div>

            {aiInsightsEnabled && (
              <div className="flex flex-col gap-3 rounded-md border border-border p-3">
                <Controller
                  name="connectionId"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>App Connection</FieldLabel>
                      <FieldContent>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={isPending || llmConnections.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                // eslint-disable-next-line no-nested-ternary
                                isPending
                                  ? "Loading connections..."
                                  : llmConnections.length === 0
                                    ? "No AI connections configured"
                                    : "Select a connection"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {llmConnections.map((conn) => (
                              <SelectItem key={conn.id} value={conn.id}>
                                {conn.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldContent>
                      {error && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />

                <Controller
                  name="model"
                  control={control}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>Model</FieldLabel>
                      <FieldContent>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!selectedProvider}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                !selectedProvider ? "Select a connection first" : "Select a model"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModels.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FieldContent>
                      {error && <FieldError>{error.message}</FieldError>}
                    </Field>
                  )}
                />
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t">
          <Button
            variant="neutral"
            onClick={handleSubmit(onSubmit)}
            isDisabled={
              isSubmitting ||
              (aiInsightsEnabled && (llmConnections.length === 0 || !selectedProvider))
            }
          >
            Update Details
          </Button>
          <Button variant="outline" className="mr-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {config && (
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await onSave(null);
                  onOpenChange(false);
                } catch {
                  createNotification({
                    type: "error",
                    text: "Failed to disable session recording"
                  });
                }
              }}
            >
              Disable
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
