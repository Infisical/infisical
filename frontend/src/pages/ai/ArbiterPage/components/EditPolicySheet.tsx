import { useEffect } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, ShieldIcon, TrashIcon, ZapIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  FieldError,
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
  UnstableIconButton
} from "@app/components/v3";
import { useGetAgentPolicy, useUpdateAgentPolicy } from "@app/hooks/api";

import { AGENTS } from "../data";

const ACTION_DESCRIPTIONS: Record<string, string> = {
  // Triage Agent
  classify_ticket: "Categorizes incoming tickets by type and priority",
  assess_severity: "Evaluates ticket urgency and impact level",
  route_ticket: "Routes tickets to the appropriate handling agent",
  // Support Agent
  lookup_order_history: "Retrieves customer order history and details",
  check_inventory: "Checks product availability and stock levels",
  issue_refund: "Processes refund requests for customer orders",
  access_payment_info: "Accesses customer payment and billing details",
  compose_response: "Drafts a response message for the customer",
  send_customer_email: "Sends an email communication to the customer",
  request_escalation: "Requests case escalation to a senior agent",
  // Escalation Agent
  review_case: "Triggers manual review for high-risk tickets",
  approve_refund: "Automatically processes refund requests",
  override_policy: "Overrides standard policy for exceptional cases",
  flag_for_human_review: "Flags case for human supervisor review",
  // Fulfillment Agent
  create_shipment: "Creates a new shipment for an order",
  process_return: "Processes a product return request",
  check_warehouse_inventory: "Checks warehouse stock and availability",
  generate_shipping_label: "Generates a shipping label for a package",
  update_tracking: "Updates shipment tracking information"
};

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

// --- Schemas for split forms ---
const editActionsFormSchema = z.object({
  selfActions: z.array(actionFormSchema)
});

const editInboundFormSchema = z.object({
  inboundPolicies: z.array(inboundPolicyFormSchema)
});

type TEditActionsForm = z.infer<typeof editActionsFormSchema>;
type TEditInboundForm = z.infer<typeof editInboundFormSchema>;

type ActionsSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  projectId: string;
};

type InboundSheetProps = {
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
const toFlatPolicies = (
  actions: { value: string; conditions: z.infer<typeof conditionFormSchema>[] }[]
) => {
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

const ReadOnlyActionFields = ({
  control,
  baseName,
  actionDescription
}: {
  control: any;
  baseName: string;
  actionDescription?: string;
}) => {
  const conditions = useFieldArray({
    control,
    name: `${baseName}.conditions`
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-accent/10">
          <ZapIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <Controller
            control={control}
            name={`${baseName}.value`}
            render={({ field }) => (
              <div className="font-mono text-sm font-semibold">{field.value}</div>
            )}
          />
          {actionDescription && <div className="text-xs text-accent">{actionDescription}</div>}
        </div>
        <Badge variant="neutral">
          {conditions.fields.length} {conditions.fields.length === 1 ? "condition" : "conditions"}
        </Badge>
      </div>

      {/* Conditions */}
      <div className="space-y-4 p-4">
        {conditions.fields.map((condField, condIdx) => (
          <div key={condField.id}>
            <div className="mb-1.5 font-mono text-[10px] tracking-widest text-muted uppercase">
              Condition {condIdx + 1}
            </div>
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 border-l-2 border-border pl-3">
                <Controller
                  control={control}
                  name={`${baseName}.conditions.${condIdx}.prompt`}
                  render={({ field, fieldState: { error } }) => (
                    <div className="flex-1">
                      <TextArea
                        {...field}
                        rows={2}
                        placeholder="Describe the condition to evaluate..."
                      />
                      {error && <FieldError>{error.message}</FieldError>}
                    </div>
                  )}
                />
              </div>
              <UnstableIconButton
                variant="ghost"
                size="xs"
                className="mt-2"
                onClick={() => conditions.remove(condIdx)}
              >
                <TrashIcon className="size-3.5 text-danger" />
              </UnstableIconButton>
            </div>
          </div>
        ))}

        <Button
          onClick={() =>
            conditions.append({
              id: `cond_${crypto.randomUUID().slice(0, 8)}`,
              description: "",
              prompt: "",
              enforce: "llm"
            })
          }
          variant="outline"
          size="sm"
        >
          <PlusIcon />
          Add Evaluation Criteria
        </Button>
      </div>
    </div>
  );
};

const InboundActionCard = ({
  control,
  baseName,
  onRemove,
  availableActions
}: {
  control: any;
  baseName: string;
  onRemove: () => void;
  availableActions: string[];
}) => {
  const conditions = useFieldArray({
    control,
    name: `${baseName}.conditions`
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-2 py-2">
        <div className="flex size-8 items-center justify-center rounded-md bg-accent/10">
          <ZapIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <Controller
            control={control}
            name={`${baseName}.value`}
            render={({ field, fieldState: { error } }) => (
              <div>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-7 w-fit gap-1.5 border-none bg-transparent px-0 font-mono text-sm font-semibold shadow-none">
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
        </div>
        <Badge variant="neutral">
          {conditions.fields.length}{" "}
          {conditions.fields.length === 1 ? "condition" : "conditions"}
        </Badge>
        <UnstableIconButton variant="ghost" size="xs" onClick={onRemove}>
          <TrashIcon className="size-3.5 text-danger" />
        </UnstableIconButton>
      </div>

      {/* Conditions */}
      <div className="space-y-4 p-4">
        {conditions.fields.map((condField, condIdx) => (
          <div key={condField.id}>
            <div className="mb-1.5 font-mono text-[10px] tracking-widest text-muted uppercase">
              Condition {condIdx + 1}
            </div>
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 border-l-2 border-border pl-3">
                <Controller
                  control={control}
                  name={`${baseName}.conditions.${condIdx}.prompt`}
                  render={({ field, fieldState: { error } }) => (
                    <div className="flex-1">
                      <TextArea
                        {...field}
                        rows={2}
                        placeholder="Describe the condition to evaluate..."
                      />
                      {error && <FieldError>{error.message}</FieldError>}
                    </div>
                  )}
                />
              </div>
              <UnstableIconButton
                variant="ghost"
                size="xs"
                className="mt-2"
                onClick={() => conditions.remove(condIdx)}
              >
                <TrashIcon className="size-3.5 text-danger" />
              </UnstableIconButton>
            </div>
          </div>
        ))}

        <Button
          onClick={() =>
            conditions.append({
              id: `cond_${crypto.randomUUID().slice(0, 8)}`,
              description: "",
              prompt: "",
              enforce: "llm"
            })
          }
          variant="outline"
          size="sm"
        >
          <PlusIcon />
          Add Evaluation Criteria
        </Button>
      </div>
    </div>
  );
};

const InboundPolicyCard = ({
  nestIndex,
  control,
  availableActions,
  onRemove,
  fromAgent
}: {
  nestIndex: number;
  control: any;
  availableActions: string[];
  onRemove: () => void;
  fromAgent: { name: string; description: string } | null;
}) => {
  const actions = useFieldArray({
    control,
    name: `inboundPolicies.${nestIndex}.actions`
  });

  return (
    <div className="rounded-lg border border-border">
      {/* Inbound policy header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-accent/10">
          <ShieldIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <Controller
            control={control}
            name={`inboundPolicies.${nestIndex}.fromAgentId`}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="h-7 w-fit gap-1.5 border-none bg-transparent px-0 text-sm font-semibold shadow-none">
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
          {fromAgent && (
            <div className="text-xs text-accent">{fromAgent.description}</div>
          )}
        </div>
        <Badge variant="neutral">
          {actions.fields.length} {actions.fields.length === 1 ? "action" : "actions"}
        </Badge>
        <UnstableIconButton variant="ghost" size="xs" onClick={onRemove}>
          <TrashIcon className="size-3.5 text-danger" />
        </UnstableIconButton>
      </div>

      {/* Actions list */}
      <div className="space-y-3 p-4">
        {actions.fields.map((field, idx) => (
          <InboundActionCard
            key={field.id}
            control={control}
            baseName={`inboundPolicies.${nestIndex}.actions.${idx}`}
            onRemove={() => actions.remove(idx)}
            availableActions={availableActions}
          />
        ))}

        <Button
          onClick={() => actions.append({ value: "", conditions: [] })}
          variant="outline"
          size="sm"
        >
          <PlusIcon />
          Add Action
        </Button>
      </div>
    </div>
  );
};

// --- Edit Actions Sheet ---
export const EditActionsSheet = ({
  isOpen,
  onOpenChange,
  agentId,
  projectId
}: ActionsSheetProps) => {
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
  } = useForm<TEditActionsForm>({
    resolver: zodResolver(editActionsFormSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: {
      selfActions: []
    }
  });

  useEffect(() => {
    if (policy) {
      reset({
        selfActions: toGroupedActions(
          policy.selfPolicies.allowedActions,
          policy.selfPolicies.promptPolicies
        )
      });
    }
  }, [policy, reset]);

  const selfActions = useFieldArray({
    control,
    name: "selfActions"
  });

  const watchedSelfActions = useWatch({ control, name: "selfActions" });

  const onSubmit = async (formData: TEditActionsForm) => {
    if (!agentId) return;
    try {
      const selfFlat = toFlatPolicies(formData.selfActions);
      await updatePolicy.mutateAsync({
        agentId,
        projectId,
        selfPolicies: selfFlat,
        inboundPolicies: (policy?.inboundPolicies ?? []).map((ip) => ({
          fromAgentId: ip.fromAgentId || undefined,
          allowedToRequest: ip.allowedToRequest,
          promptPolicies: ip.promptPolicies
        }))
      });
      createNotification({ text: "Actions updated successfully", type: "success" });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to update actions", type: "error" });
    }
  };

  const currentAgent = agentId ? agentMap[agentId] : null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-[50vw] !max-w-none flex-col gap-y-0 overflow-hidden p-0"
        side="right"
      >
        <SheetHeader className="mb-0 border-b border-border px-6 pt-6 pb-6">
          <SheetTitle>Edit Action Conditions — {currentAgent?.name ?? agentId}</SheetTitle>
          <SheetDescription>
            Add conditions to evaluate when this agent performs actions.
          </SheetDescription>
        </SheetHeader>

        {isPending && agentId ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted">
            Loading policy...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col bg-bunker-900"
          >
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              {selfActions.fields.length === 0 ? (
                <div className="rounded-md border border-border p-6 text-center">
                  <p className="text-sm text-muted">No actions registered for this agent.</p>
                  <p className="mt-1 text-xs text-accent">
                    Actions are registered by the agent at deployment time.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selfActions.fields.map((field, idx) => (
                    <ReadOnlyActionFields
                      key={field.id}
                      control={control}
                      baseName={`selfActions.${idx}`}
                      actionDescription={
                        ACTION_DESCRIPTIONS[watchedSelfActions?.[idx]?.value ?? ""]
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <SheetFooter className="flex flex-row items-center justify-end gap-x-4 border-t border-border bg-popover px-6 py-4">
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

// --- Edit Inbound Policies Sheet ---
export const EditInboundPoliciesSheet = ({
  isOpen,
  onOpenChange,
  agentId,
  projectId
}: InboundSheetProps) => {
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
  } = useForm<TEditInboundForm>({
    resolver: zodResolver(editInboundFormSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: {
      inboundPolicies: []
    }
  });

  useEffect(() => {
    if (policy) {
      reset({
        inboundPolicies: policy.inboundPolicies.map((ip) => ({
          fromAgentId: ip.fromAgentId ?? "",
          actions: toGroupedActions(ip.allowedToRequest, ip.promptPolicies)
        }))
      });
    }
  }, [policy, reset]);

  const inboundPolicies = useFieldArray({
    control,
    name: "inboundPolicies"
  });

  const watchedInbound = useWatch({ control, name: "inboundPolicies" });

  // Get self action names from the existing policy to use as available actions for inbound
  const selfActionNames = policy?.selfPolicies.allowedActions ?? [];

  const onSubmit = async (formData: TEditInboundForm) => {
    if (!agentId) return;
    try {
      const selfFlat = toFlatPolicies(
        toGroupedActions(
          policy?.selfPolicies.allowedActions ?? [],
          policy?.selfPolicies.promptPolicies ?? []
        )
      );
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
      createNotification({ text: "Inbound policies updated successfully", type: "success" });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to update inbound policies", type: "error" });
    }
  };

  const currentAgent = agentId ? agentMap[agentId] : null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="flex w-[50vw] !max-w-none flex-col gap-y-0 overflow-hidden p-0"
        side="right"
      >
        <SheetHeader className="mb-0 border-b border-border px-6 pt-6 pb-6">
          <SheetTitle>Edit Inbound Policies — {currentAgent?.name ?? agentId}</SheetTitle>
          <SheetDescription>
            Configure which agents can request actions from this agent and their conditions.
          </SheetDescription>
        </SheetHeader>

        {isPending && agentId ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted">
            Loading policy...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col bg-bunker-900"
          >
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
              {inboundPolicies.fields.length === 0 ? (
                <div className="rounded-md border border-border p-6 text-center">
                  <ShieldIcon className="mx-auto mb-2 size-8 text-muted" />
                  <p className="text-sm text-muted">No inbound policies configured.</p>
                  <p className="mt-1 text-xs text-accent">
                    Add an inbound policy to allow other agents to request actions from this
                    agent.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {inboundPolicies.fields.map((field, idx) => {
                    const fromId = watchedInbound?.[idx]?.fromAgentId;
                    const fromAgent = fromId ? agentMap[fromId] : null;
                    return (
                      <InboundPolicyCard
                        key={field.id}
                        nestIndex={idx}
                        control={control}
                        availableActions={selfActionNames}
                        onRemove={() => inboundPolicies.remove(idx)}
                        fromAgent={fromAgent}
                      />
                    );
                  })}
                </div>
              )}

              <Button
                className="mt-4"
                onClick={() => {
                  inboundPolicies.append({
                    fromAgentId: "",
                    actions: [{ value: "", conditions: [] }]
                  });
                }}
                variant="outline"
                size="sm"
              >
                <PlusIcon />
                Add Inbound Policy
              </Button>
            </div>

            <SheetFooter className="flex flex-row items-center justify-end gap-x-4 border-t border-border bg-popover px-6 py-4">
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
