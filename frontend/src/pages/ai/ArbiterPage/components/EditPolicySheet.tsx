import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, ShieldIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
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
  UnstableInput
} from "@app/components/v3";
import { useGetAgentPolicy, useUpdateAgentPolicy } from "@app/hooks/api";

import { AGENTS } from "../data";

const conditionFormSchema = z.object({
  id: z.string().default(""),
  description: z.string().default(""),
  prompt: z.string().min(1, "Prompt condition is required"),
  enforce: z.enum(["llm", "log_only"]).default("llm")
});

const actionFormSchema = z.object({
  value: z.string().min(1, "Action cannot be empty"),
  conditions: z.array(conditionFormSchema)
});

const inboundPolicyFormSchema = z.object({
  fromAgentId: z.string(),
  actions: z.array(actionFormSchema)
});

const editPolicyFormSchema = z.object({
  selfActions: z.array(actionFormSchema),
  inboundPolicies: z.array(inboundPolicyFormSchema)
});

type TEditPolicyForm = z.infer<typeof editPolicyFormSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  projectId: string;
};

const agentMap = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

/**
 * Convert flat API data (allowedActions + promptPolicies) into grouped action form data.
 * Each action gets the conditions whose onActions include that action name.
 */
const toGroupedActions = (
  allowedActions: string[],
  promptPolicies: {
    id: string;
    description: string;
    prompt: string;
    onActions: string[];
    enforce: "llm" | "log_only";
  }[]
) => {
  return allowedActions.map((action) => ({
    value: action,
    conditions: promptPolicies
      .filter((pp) => pp.onActions.includes(action))
      .map((pp) => ({
        id: pp.id,
        description: pp.description,
        prompt: pp.prompt,
        enforce: pp.enforce
      }))
  }));
};

/**
 * Convert grouped action form data back to flat API shape.
 * Deduplicates prompt policies by id, merging onActions.
 */
const toFlatPolicies = (actions: TEditPolicyForm["selfActions"]) => {
  const allowedActions = actions.map((a) => a.value);
  const policyMap = new Map<
    string,
    {
      id: string;
      description: string;
      prompt: string;
      onActions: string[];
      enforce: "llm" | "log_only";
    }
  >();

  for (const action of actions) {
    for (const cond of action.conditions) {
      const key = cond.id;
      const existing = policyMap.get(key);
      if (existing) {
        if (!existing.onActions.includes(action.value)) {
          existing.onActions.push(action.value);
        }
      } else {
        policyMap.set(key, {
          id: cond.id,
          description: cond.description,
          prompt: cond.prompt,
          enforce: cond.enforce,
          onActions: [action.value]
        });
      }
    }
  }

  return { allowedActions, promptPolicies: Array.from(policyMap.values()) };
};

const ActionFields = ({
  control,
  baseName,
  onRemoveAction,
  availableActions
}: {
  control: TEditPolicyForm extends infer T
    ? import("react-hook-form").Control<T & TEditPolicyForm>
    : never;
  baseName: `selfActions.${number}` | `inboundPolicies.${number}.actions.${number}`;
  onRemoveAction: () => void;
  availableActions?: string[];
}) => {
  const conditions = useFieldArray({
    control,
    name: `${baseName}.conditions`
  });

  return (
    <div className="space-y-3 rounded-md border border-border bg-container p-3">
      <div className="flex items-center gap-2">
        {availableActions ? (
          <Controller
            control={control}
            name={`${baseName}.value`}
            render={({ field, fieldState: { error } }) => (
              <div className="flex-1">
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select action..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">All actions</SelectItem>
                    {availableActions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error && <FieldError>{error.message}</FieldError>}
              </div>
            )}
          />
        ) : (
          <Controller
            control={control}
            name={`${baseName}.value`}
            render={({ field, fieldState: { error } }) => (
              <div className="flex-1">
                <UnstableInput {...field} placeholder="action_name" />
                {error && <FieldError>{error.message}</FieldError>}
              </div>
            )}
          />
        )}
        <UnstableIconButton variant="ghost" size="xs" onClick={onRemoveAction}>
          <TrashIcon className="text-danger" />
        </UnstableIconButton>
      </div>

      {conditions.fields.length > 0 && (
        <div className="ml-3 space-y-2 border-l-2 border-border pl-3">
          {conditions.fields.map((condField, condIdx) => (
            <div key={condField.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Condition</span>
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => conditions.remove(condIdx)}
                >
                  <TrashIcon className="size-3 text-danger" />
                </UnstableIconButton>
              </div>
              <Controller
                control={control}
                name={`${baseName}.conditions.${condIdx}.prompt`}
                render={({ field, fieldState: { error } }) => (
                  <>
                    <TextArea
                      {...field}
                      rows={2}
                      placeholder="Describe the condition to evaluate..."
                    />
                    {error && <FieldError>{error.message}</FieldError>}
                  </>
                )}
              />
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() =>
          conditions.append({
            id: `cond_${crypto.randomUUID().slice(0, 8)}`,
            description: "",
            prompt: "",
            enforce: "llm"
          })
        }
      >
        <PlusIcon />
        Add Condition
      </Button>
    </div>
  );
};

const InboundPolicyFields = ({
  nestIndex,
  control,
  availableActions
}: {
  nestIndex: number;
  control: TEditPolicyForm extends infer T
    ? import("react-hook-form").Control<T & TEditPolicyForm>
    : never;
  availableActions: string[];
}) => {
  const actions = useFieldArray({
    control,
    name: `inboundPolicies.${nestIndex}.actions`
  });

  return (
    <div className="space-y-4">
      <div>
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
      </div>

      <div>
        <FieldTitle className="mb-2">Allowed To Request</FieldTitle>
        <div className="space-y-2">
          {actions.fields.map((field, idx) => (
            <ActionFields
              key={field.id}
              control={control}
              baseName={`inboundPolicies.${nestIndex}.actions.${idx}`}
              onRemoveAction={() => actions.remove(idx)}
              availableActions={availableActions}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => actions.append({ value: "", conditions: [] })}
          >
            <PlusIcon />
            Add Action
          </Button>
        </div>
      </div>
    </div>
  );
};

export const EditPolicySheet = ({ isOpen, onOpenChange, agentId, projectId }: Props) => {
  const [selectedTarget, setSelectedTarget] = useState<"self" | number>("self");

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
      selfActions: [],
      inboundPolicies: []
    }
  });

  useEffect(() => {
    if (policy) {
      reset({
        selfActions: toGroupedActions(
          policy.selfPolicies.allowedActions,
          policy.selfPolicies.promptPolicies
        ),
        inboundPolicies: policy.inboundPolicies.map((ip) => ({
          fromAgentId: ip.fromAgentId ?? "",
          actions: toGroupedActions(ip.allowedToRequest, ip.promptPolicies)
        }))
      });
      setSelectedTarget("self");
    }
  }, [policy, reset]);

  const selfActions = useFieldArray({
    control,
    name: "selfActions"
  });

  const inboundPolicies = useFieldArray({
    control,
    name: "inboundPolicies"
  });

  const watchedInbound = useWatch({ control, name: "inboundPolicies" });
  const watchedSelfActions = useWatch({ control, name: "selfActions" });
  const selfActionNames = (watchedSelfActions ?? []).map((a) => a.value).filter(Boolean);

  const onSubmit = async (formData: TEditPolicyForm) => {
    if (!agentId) return;
    try {
      const selfFlat = toFlatPolicies(formData.selfActions);
      await updatePolicy.mutateAsync({
        agentId,
        projectId,
        selfPolicies: selfFlat,
        inboundPolicies: formData.inboundPolicies.map((ip) => {
          const flat = toFlatPolicies(ip.actions);
          return {
            fromAgentId: ip.fromAgentId || undefined,
            allowedToRequest: flat.allowedActions,
            promptPolicies: flat.promptPolicies
          };
        })
      });
      createNotification({ text: "Policy updated successfully", type: "success" });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to update policy", type: "error" });
    }
  };

  const currentAgent = agentId ? agentMap[agentId] : null;

  const getTargetInfo = () => {
    if (selectedTarget === "self") {
      return {
        name: currentAgent?.name ?? agentId ?? "",
        description:
          currentAgent?.description ?? "Configure self-execution policies for this agent."
      };
    }

    const inbound = watchedInbound?.[selectedTarget];
    const fromAgent = inbound?.fromAgentId ? agentMap[inbound.fromAgentId] : null;
    return {
      name: fromAgent?.name ?? "Unassigned Agent",
      description: fromAgent?.description ?? "Select an agent to configure inbound policies."
    };
  };

  const targetInfo = getTargetInfo();

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-[50vw] !max-w-none flex-col gap-y-0 overflow-hidden p-0"
        side="right"
      >
        <SheetHeader className="mb-0 border-b border-border px-6 pt-6 pb-6">
          <SheetTitle>Edit Policy — {currentAgent?.name ?? agentId}</SheetTitle>
          <SheetDescription>
            Configure permissions and prompt policies for this agent.
          </SheetDescription>
        </SheetHeader>

        {isPending && agentId ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted">
            Loading policy...
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              {/* Left sidebar navigation */}
              <nav className="w-48 shrink-0 space-y-1 overflow-y-auto border-r border-border p-3">
                <button
                  type="button"
                  onClick={() => setSelectedTarget("self")}
                  className={`w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
                    selectedTarget === "self"
                      ? "bg-primary/10 text-primary"
                      : "text-label hover:bg-container"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldIcon className="size-3.5 shrink-0" />
                    Self
                  </div>
                </button>

                {inboundPolicies.fields.map((field, idx) => {
                  const fromId = watchedInbound?.[idx]?.fromAgentId;
                  const fromAgent = fromId ? agentMap[fromId] : null;
                  return (
                    <button
                      key={field.id}
                      type="button"
                      onClick={() => setSelectedTarget(idx)}
                      className={`w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
                        selectedTarget === idx
                          ? "bg-primary/10 text-primary"
                          : "text-label hover:bg-container"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{fromAgent?.name ?? "Unassigned"}</span>
                        <UnstableIconButton
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            inboundPolicies.remove(idx);
                            setSelectedTarget("self");
                          }}
                        >
                          <TrashIcon className="size-3 text-danger" />
                        </UnstableIconButton>
                      </div>
                    </button>
                  );
                })}

                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="w-full"
                  onClick={() => {
                    inboundPolicies.append({
                      fromAgentId: "",
                      actions: [{ value: "", conditions: [] }]
                    });
                    setSelectedTarget(inboundPolicies.fields.length);
                  }}
                >
                  <PlusIcon />
                  Add Inbound
                </Button>
              </nav>

              {/* Right content area */}
              <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
                {/* Target header */}
                <div className="mb-4">
                  <h3 className="text-sm font-semibold">{targetInfo.name}</h3>
                  <p className="mt-0.5 text-xs text-accent">{targetInfo.description}</p>
                </div>

                {selectedTarget === "self" ? (
                  <div>
                    <FieldTitle className="mb-2">Actions</FieldTitle>
                    <div className="space-y-2">
                      {selfActions.fields.map((field, idx) => (
                        <ActionFields
                          key={field.id}
                          control={control}
                          baseName={`selfActions.${idx}`}
                          onRemoveAction={() => selfActions.remove(idx)}
                        />
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => selfActions.append({ value: "", conditions: [] })}
                      >
                        <PlusIcon />
                        Add Action
                      </Button>
                    </div>
                  </div>
                ) : (
                  <InboundPolicyFields
                    nestIndex={selectedTarget}
                    control={control}
                    availableActions={selfActionNames}
                  />
                )}
              </div>
            </div>

            <SheetFooter className="flex flex-row items-center justify-end gap-x-4 border-t border-border px-6 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="project" disabled={!isDirty || isSubmitting}>
                Save Changes
              </Button>
            </SheetFooter>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
};
