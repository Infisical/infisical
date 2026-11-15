import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";

export type ApproverKind = "user" | "group";
export type ApproverOption = { value: string; label: string; kind: ApproverKind };

export type PolicyStepDraft = {
  key: string;
  name: string;
  approvers: string[];
  requiredApprovals: number;
};

export type PolicyLimits = { maxSignings: number | null; maxWindowDuration: string | null };

export const approverKey = (kind: ApproverKind, id: string) => `${kind}:${id}`;

const splitKey = (key: string) => {
  const [kind, ...rest] = key.split(":");
  return { kind: kind as ApproverKind, id: rest.join(":") };
};

const NO_WINDOW_LIMIT = "none";

const WINDOW_OPTIONS = [
  { value: NO_WINDOW_LIMIT, label: "No limit" },
  { value: "1h", label: "1 hour" },
  { value: "8h", label: "8 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" }
];

export const newPolicyStep = (index: number): PolicyStepDraft => ({
  key: crypto.randomUUID(),
  name: `Step ${index + 1}`,
  approvers: [],
  requiredApprovals: 1
});

export const policyStepsPayload = (steps: PolicyStepDraft[]) =>
  steps.map((step, index) => ({
    stepNumber: index + 1,
    name: step.name.trim() || null,
    requiredApprovals: Math.max(1, step.requiredApprovals),
    approverUserIds: step.approvers
      .map(splitKey)
      .filter((entry) => entry.kind === "user")
      .map((entry) => entry.id),
    approverGroupIds: step.approvers
      .map(splitKey)
      .filter((entry) => entry.kind === "group")
      .map((entry) => entry.id)
  }));

export const policyProblem = (steps: PolicyStepDraft[], limits: PolicyLimits) => {
  const emptyIndex = steps.findIndex((step) => step.approvers.length === 0);
  if (emptyIndex >= 0) return `Step ${emptyIndex + 1} needs at least one approver, or remove it.`;
  const overIndex = steps.findIndex((step) => {
    const users = step.approvers.filter((key) => key.startsWith("user:")).length;
    return users === step.approvers.length && step.requiredApprovals > users;
  });
  if (overIndex >= 0)
    return `Step ${overIndex + 1}: required approvals can't exceed the number of approvers. Add a group to allow more.`;
  if (steps.length && limits.maxSignings == null && !limits.maxWindowDuration)
    return "Set signatures per approval or a signing window.";
  return undefined;
};

export const PolicyStepsEditor = ({
  steps,
  onChange,
  approverOptions,
  emptyApproversText
}: {
  steps: PolicyStepDraft[];
  onChange: (steps: PolicyStepDraft[]) => void;
  approverOptions: ApproverOption[];
  emptyApproversText: string;
}) => {
  const patchStep = (key: string, patch: Partial<PolicyStepDraft>) =>
    onChange(steps.map((step) => (step.key === key ? { ...step, ...patch } : step)));
  const addStep = () => onChange([...steps, newPolicyStep(steps.length)]);
  const options = approverOptions.map((option) => ({
    value: approverKey(option.kind, option.value),
    label: option.label,
    group: option.kind === "group" ? "Groups" : "Users"
  }));

  if (!steps.length)
    return (
      <EmptyState
        size="sm"
        icon="shield"
        title="No approval required"
        description="Members can sign without anyone else approving. Add an approval step to change this."
        actions={
          <Button variant="outline" icon="plus" onClick={addStep}>
            Add approval step
          </Button>
        }
      />
    );

  return (
    <Stack gap={12}>
      {steps.map((step, index) => (
        <Card
          key={step.key}
          variant="framed"
          size="sm"
          title={`Step ${index + 1}`}
          action={
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => onChange(steps.filter((entry) => entry.key !== step.key))}
            />
          }
        >
          <Stack gap={12}>
            <Field label="Step name">
              <Input
                value={step.name}
                placeholder="Engineering lead"
                onChange={(event) => patchStep(step.key, { name: event.target.value })}
              />
            </Field>
            <Inline gap={12} align="start" wrap={false}>
              <InlineGrow>
                <Field
                  label="Approvers"
                  description="Approvers must already be members, and can't be auditors."
                >
                  <Combobox
                    multiple
                    label="Approvers"
                    placeholder="Select approvers"
                    emptyText={emptyApproversText}
                    options={options}
                    value={step.approvers}
                    onValueChange={(approvers) => patchStep(step.key, { approvers })}
                  />
                </Field>
              </InlineGrow>
              <Field label="Required">
                <Input
                  type="number"
                  min={1}
                  width="xs"
                  value={String(step.requiredApprovals)}
                  onChange={(event) =>
                    patchStep(step.key, {
                      requiredApprovals: Math.max(1, Number(event.target.value) || 1)
                    })
                  }
                />
              </Field>
            </Inline>
          </Stack>
        </Card>
      ))}
      <div>
        <Button variant="outline" icon="plus" onClick={addStep}>
          Add step
        </Button>
      </div>
    </Stack>
  );
};

export const PolicyLimitsFields = ({
  limits,
  onChange,
  showError
}: {
  limits: PolicyLimits;
  onChange: (limits: PolicyLimits) => void;
  showError?: boolean;
}) => (
  <Grid columns={2} gap={16}>
    <Field
      label="Signatures per approval"
      description="How many times one approval can be used to sign. Leave empty for unlimited."
      error={showError ? "Set a limit here or pick a signing window." : undefined}
    >
      <Input
        type="number"
        min={1}
        value={limits.maxSignings == null ? "" : String(limits.maxSignings)}
        placeholder="Unlimited"
        invalid={showError}
        onChange={(event) =>
          onChange({
            ...limits,
            maxSignings: event.target.value ? Math.max(1, Number(event.target.value)) : null
          })
        }
      />
    </Field>
    <Field
      label="Signing window"
      description="The longest window a request can ask for. It starts when the request is approved."
      error={showError ? "Pick a window here or set signatures per approval." : undefined}
    >
      <Select
        aria-label="Signing window"
        invalid={showError}
        value={limits.maxWindowDuration ?? NO_WINDOW_LIMIT}
        options={WINDOW_OPTIONS}
        onValueChange={(next) =>
          onChange({ ...limits, maxWindowDuration: next === NO_WINDOW_LIMIT ? null : next })
        }
      />
    </Field>
  </Grid>
);
