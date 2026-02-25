import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldTitle,
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
  TextArea,
  UnstableIconButton,
  UnstableInput,
  UnstableSeparator
} from "@app/components/v3";
import { useGetAgentPolicy, useUpdateAgentPolicy } from "@app/hooks/api";

import { AGENTS } from "../data";

const promptPolicyFormSchema = z.object({
  id: z.string().min(1, "ID is required"),
  description: z.string().min(1, "Description is required"),
  prompt: z.string().min(1, "Prompt is required"),
  onActions: z.string().min(1, "At least one action is required"),
  enforce: z.enum(["llm", "log_only"])
});

const inboundPolicyFormSchema = z.object({
  fromAgentId: z.string(),
  allowedToRequest: z.array(z.object({ value: z.string().min(1, "Action cannot be empty") })),
  promptPolicies: z.array(promptPolicyFormSchema)
});

const editPolicyFormSchema = z.object({
  selfPolicies: z.object({
    allowedActions: z.array(z.object({ value: z.string().min(1, "Action cannot be empty") })),
    promptPolicies: z.array(promptPolicyFormSchema)
  }),
  inboundPolicies: z.array(inboundPolicyFormSchema)
});

type TEditPolicyForm = z.infer<typeof editPolicyFormSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  projectId: string;
};

const agentNameMap = Object.fromEntries(AGENTS.map((a) => [a.id, a.name]));

const PromptPolicyFields = ({
  control,
  baseName,
  onRemove
}: {
  control: TEditPolicyForm extends infer T ? import("react-hook-form").Control<T & TEditPolicyForm> : never;
  baseName: `selfPolicies.promptPolicies.${number}` | `inboundPolicies.${number}.promptPolicies.${number}`;
  onRemove: () => void;
}) => {
  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-label">Prompt Policy</span>
        <UnstableIconButton variant="ghost" size="xs" onClick={onRemove}>
          <TrashIcon className="text-danger" />
        </UnstableIconButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel>ID</FieldLabel>
          <FieldContent>
            <Controller
              control={control}
              name={`${baseName}.id`}
              render={({ field, fieldState: { error } }) => (
                <>
                  <UnstableInput {...field} placeholder="policy_id" />
                  {error && <FieldError>{error.message}</FieldError>}
                </>
              )}
            />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel>Enforce</FieldLabel>
          <FieldContent>
            <Controller
              control={control}
              name={`${baseName}.enforce`}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llm">LLM</SelectItem>
                    <SelectItem value="log_only">Log Only</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </FieldContent>
        </Field>
      </div>
      <Field>
        <FieldLabel>Description</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`${baseName}.description`}
            render={({ field, fieldState: { error } }) => (
              <>
                <UnstableInput {...field} placeholder="What this policy does" />
                {error && <FieldError>{error.message}</FieldError>}
              </>
            )}
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel>Prompt</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`${baseName}.prompt`}
            render={({ field, fieldState: { error } }) => (
              <>
                <TextArea
                  {...field}
                  rows={3}
                  placeholder="Policy prompt for the LLM..."
                />
                {error && <FieldError>{error.message}</FieldError>}
              </>
            )}
          />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel>On Actions (comma-separated)</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`${baseName}.onActions`}
            render={({ field, fieldState: { error } }) => (
              <>
                <UnstableInput
                  {...field}
                  placeholder="action_1, action_2"
                />
                {error && <FieldError>{error.message}</FieldError>}
              </>
            )}
          />
        </FieldContent>
      </Field>
    </div>
  );
};

const InboundPolicyFields = ({
  nestIndex,
  control,
  onRemove
}: {
  nestIndex: number;
  control: TEditPolicyForm extends infer T ? import("react-hook-form").Control<T & TEditPolicyForm> : never;
  onRemove: () => void;
}) => {
  const allowedToRequest = useFieldArray({
    control,
    name: `inboundPolicies.${nestIndex}.allowedToRequest`
  });

  const promptPolicies = useFieldArray({
    control,
    name: `inboundPolicies.${nestIndex}.promptPolicies`
  });

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-label">Inbound Policy</span>
        <UnstableIconButton variant="ghost" size="xs" onClick={onRemove}>
          <TrashIcon className="text-danger" />
        </UnstableIconButton>
      </div>

      <Field>
        <FieldLabel>From Agent</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name={`inboundPolicies.${nestIndex}.fromAgentId`}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select agent..." />
                </SelectTrigger>
                <SelectContent>
                  {AGENTS.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FieldContent>
      </Field>

      <div>
        <FieldTitle className="mb-2">Allowed To Request</FieldTitle>
        <div className="space-y-2">
          {allowedToRequest.fields.map((field, idx) => (
            <div key={field.id} className="flex items-center gap-2">
              <Controller
                control={control}
                name={`inboundPolicies.${nestIndex}.allowedToRequest.${idx}.value`}
                render={({ field: inputField, fieldState: { error } }) => (
                  <div className="flex-1">
                    <UnstableInput {...inputField} placeholder="action_name" />
                    {error && <FieldError>{error.message}</FieldError>}
                  </div>
                )}
              />
              <UnstableIconButton
                variant="ghost"
                size="xs"
                onClick={() => allowedToRequest.remove(idx)}
              >
                <TrashIcon className="text-danger" />
              </UnstableIconButton>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => allowedToRequest.append({ value: "" })}
          >
            <PlusIcon />
            Add Action
          </Button>
        </div>
      </div>

      {promptPolicies.fields.length > 0 && (
        <div>
          <FieldTitle className="mb-2">Prompt Policies</FieldTitle>
          <div className="space-y-2">
            {promptPolicies.fields.map((field, idx) => (
              <PromptPolicyFields
                key={field.id}
                control={control}
                baseName={`inboundPolicies.${nestIndex}.promptPolicies.${idx}`}
                onRemove={() => promptPolicies.remove(idx)}
              />
            ))}
          </div>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() =>
          promptPolicies.append({
            id: "",
            description: "",
            prompt: "",
            onActions: "",
            enforce: "llm"
          })
        }
      >
        <PlusIcon />
        Add Prompt Policy
      </Button>
    </div>
  );
};

export const EditPolicySheet = ({ isOpen, onOpenChange, agentId, projectId }: Props) => {
  const { data: policy, isPending } = useGetAgentPolicy({
    agentId: agentId ?? "",
    projectId
  });

  const updatePolicy = useUpdateAgentPolicy();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty }
  } = useForm<TEditPolicyForm>({
    resolver: zodResolver(editPolicyFormSchema),
    defaultValues: {
      selfPolicies: { allowedActions: [], promptPolicies: [] },
      inboundPolicies: []
    }
  });

  useEffect(() => {
    if (policy) {
      reset({
        selfPolicies: {
          allowedActions: policy.selfPolicies.allowedActions.map((a) => ({ value: a })),
          promptPolicies: policy.selfPolicies.promptPolicies.map((pp) => ({
            ...pp,
            onActions: pp.onActions.join(", ")
          }))
        },
        inboundPolicies: policy.inboundPolicies.map((ip) => ({
          fromAgentId: ip.fromAgentId ?? "",
          allowedToRequest: ip.allowedToRequest.map((a) => ({ value: a })),
          promptPolicies: ip.promptPolicies.map((pp) => ({
            ...pp,
            onActions: pp.onActions.join(", ")
          }))
        }))
      });
    }
  }, [policy, reset]);

  const selfAllowedActions = useFieldArray({
    control,
    name: "selfPolicies.allowedActions"
  });

  const selfPromptPolicies = useFieldArray({
    control,
    name: "selfPolicies.promptPolicies"
  });

  const inboundPolicies = useFieldArray({
    control,
    name: "inboundPolicies"
  });

  const onSubmit = async (formData: TEditPolicyForm) => {
    if (!agentId) return;
    try {
      await updatePolicy.mutateAsync({
        agentId,
        projectId,
        selfPolicies: {
          allowedActions: formData.selfPolicies.allowedActions.map((a) => a.value),
          promptPolicies: formData.selfPolicies.promptPolicies.map((pp) => ({
            ...pp,
            onActions: pp.onActions
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          }))
        },
        inboundPolicies: formData.inboundPolicies.map((ip) => ({
          fromAgentId: ip.fromAgentId || undefined,
          allowedToRequest: ip.allowedToRequest.map((a) => a.value),
          promptPolicies: ip.promptPolicies.map((pp) => ({
            ...pp,
            onActions: pp.onActions
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          }))
        }))
      });
      createNotification({ text: "Policy updated successfully", type: "success" });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to update policy", type: "error" });
    }
  };

  const agentName = agentId ? (agentNameMap[agentId] ?? agentId) : "";

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>Edit Policy — {agentName}</SheetTitle>
          <SheetDescription>Configure permissions and prompt policies for this agent.</SheetDescription>
        </SheetHeader>

        {isPending && agentId ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted">
            Loading policy...
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 pb-4">
            {/* Self Policies */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Self Policies</h3>

              <div className="mb-4">
                <FieldTitle className="mb-2">Allowed Actions</FieldTitle>
                <div className="space-y-2">
                  {selfAllowedActions.fields.map((field, idx) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <Controller
                        control={control}
                        name={`selfPolicies.allowedActions.${idx}.value`}
                        render={({ field: inputField, fieldState: { error } }) => (
                          <div className="flex-1">
                            <UnstableInput {...inputField} placeholder="action_name" />
                            {error && <FieldError>{error.message}</FieldError>}
                          </div>
                        )}
                      />
                      <UnstableIconButton
                        variant="ghost"
                        size="xs"
                        onClick={() => selfAllowedActions.remove(idx)}
                      >
                        <TrashIcon className="text-danger" />
                      </UnstableIconButton>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => selfAllowedActions.append({ value: "" })}
                  >
                    <PlusIcon />
                    Add Action
                  </Button>
                </div>
              </div>

              <div>
                <FieldTitle className="mb-2">Prompt Policies</FieldTitle>
                <div className="space-y-2">
                  {selfPromptPolicies.fields.map((field, idx) => (
                    <PromptPolicyFields
                      key={field.id}
                      control={control}
                      baseName={`selfPolicies.promptPolicies.${idx}`}
                      onRemove={() => selfPromptPolicies.remove(idx)}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      selfPromptPolicies.append({
                        id: "",
                        description: "",
                        prompt: "",
                        onActions: "",
                        enforce: "llm"
                      })
                    }
                  >
                    <PlusIcon />
                    Add Prompt Policy
                  </Button>
                </div>
              </div>
            </div>

            <UnstableSeparator />

            {/* Inbound Policies */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Inbound Policies</h3>
              <div className="space-y-3">
                {inboundPolicies.fields.map((field, idx) => (
                  <InboundPolicyFields
                    key={field.id}
                    nestIndex={idx}
                    control={control}
                    onRemove={() => inboundPolicies.remove(idx)}
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    inboundPolicies.append({
                      fromAgentId: "",
                      allowedToRequest: [{ value: "" }],
                      promptPolicies: []
                    })
                  }
                >
                  <PlusIcon />
                  Add Inbound Policy
                </Button>
              </div>
            </div>

            <SheetFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="project"
                disabled={!isDirty || isSubmitting}
              >
                Save Changes
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
};
