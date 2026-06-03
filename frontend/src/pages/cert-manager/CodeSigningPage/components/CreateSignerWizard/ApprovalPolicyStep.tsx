import { ClockIcon, PlusIcon, ShieldIcon, XIcon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";

import {
  ApproverOption,
  approverOptionKey,
  makeStepKey,
  NO_WINDOW_LIMIT,
  PolicyStep,
  WINDOW_DURATION_OPTIONS,
  WizardState
} from "./types";

type ApprovalPolicyStepProps = {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  approverOptions: ApproverOption[];
};

export const ApprovalPolicyStep = ({
  state,
  setState,
  approverOptions
}: ApprovalPolicyStepProps) => {
  const addStep = () => {
    setState((prev) => ({
      ...prev,
      policySteps: [
        ...prev.policySteps,
        {
          key: makeStepKey(),
          name: `Step ${prev.policySteps.length + 1}`,
          approverUserIds: [],
          approverGroupIds: [],
          requiredApprovals: 1
        }
      ]
    }));
  };

  const removeStep = (key: string) => {
    setState((prev) => ({
      ...prev,
      policySteps: prev.policySteps.filter((s) => s.key !== key)
    }));
  };

  const patchStep = (key: string, patch: Partial<PolicyStep>) => {
    setState((prev) => ({
      ...prev,
      policySteps: prev.policySteps.map((s) => (s.key === key ? { ...s, ...patch } : s))
    }));
  };

  const hasSteps = state.policySteps.length > 0;

  if (!hasSteps) {
    return (
      <div>
        <Empty className="border border-solid">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldIcon />
            </EmptyMedia>
            <EmptyTitle>No approval required</EmptyTitle>
            <EmptyDescription>
              Members can sign without approval from anyone else. Add an approval step to change
              this.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={addStep}>
              <PlusIcon className="h-3.5 w-3.5" />
              <span>Add approval step</span>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-mineshaft-100">Approves</div>
          <p className="text-xs text-mineshaft-400">
            Approvals run in order. Each step needs the listed number of approvers to approve.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addStep} className="shrink-0">
          <PlusIcon className="h-3.5 w-3.5" />
          <span>Add step</span>
        </Button>
      </div>

      <div className="space-y-3">
        {state.policySteps.map((s, idx) => {
          const takenUsers = new Set(s.approverUserIds);
          const takenGroups = new Set(s.approverGroupIds);
          const isTaken = (o: ApproverOption) =>
            o.kind === "user" ? takenUsers.has(o.value) : takenGroups.has(o.value);
          const optionsForStep = approverOptions.filter((o) => !isTaken(o));
          const valueForStep = approverOptions.filter(isTaken);

          return (
            <div
              key={s.key}
              className="rounded-md border border-mineshaft-700 bg-mineshaft-900/40 p-4"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-mineshaft-800 text-[11px] font-medium text-muted">
                  {idx + 1}
                </div>
                <Input
                  value={s.name}
                  onChange={(e) => patchStep(s.key, { name: e.target.value })}
                  placeholder={`Step ${idx + 1}`}
                  className="h-9 flex-1"
                />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => removeStep(s.key)}
                  aria-label="Remove step"
                >
                  <XIcon className="h-3.5 w-3.5 text-mineshaft-300" />
                </Button>
              </div>

              <div className="grid grid-cols-[1fr_140px] gap-3">
                <Field>
                  <FieldLabel>Approvers</FieldLabel>
                  <FieldContent>
                    <FilterableSelect<ApproverOption>
                      isMulti
                      options={optionsForStep}
                      groupBy="kind"
                      getGroupHeaderLabel={(g) => (g === "group" ? "Groups" : "Users")}
                      getOptionValue={(o) => approverOptionKey(o as ApproverOption)}
                      isOptionSelected={(o) => isTaken(o as ApproverOption)}
                      value={valueForStep}
                      onChange={(selected) => {
                        const picks = (selected as ApproverOption[] | null) ?? [];
                        patchStep(s.key, {
                          approverUserIds: picks
                            .filter((p) => p.kind === "user")
                            .map((p) => p.value),
                          approverGroupIds: picks
                            .filter((p) => p.kind === "group")
                            .map((p) => p.value)
                        });
                      }}
                      placeholder="Pick approvers from members..."
                      noOptionsMessage={() => "Add member users in the previous step first."}
                    />
                    <FieldDescription>Approvers must already be members.</FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel>Required</FieldLabel>
                  <FieldContent>
                    <Input
                      type="number"
                      min={1}
                      value={s.requiredApprovals}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const n = raw === "" ? 1 : Math.max(1, Number(raw));
                        patchStep(s.key, { requiredApprovals: n });
                      }}
                    />
                  </FieldContent>
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 text-sm font-semibold text-mineshaft-100">What an approval allows</div>
      <p className="mb-3 text-xs text-mineshaft-300">
        Once approval is granted, define how it can be used. At least one limit is required.
      </p>

      <div className="overflow-hidden rounded-md border border-mineshaft-700 bg-mineshaft-900/40">
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-mineshaft-800 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-mineshaft-300" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-mineshaft-100">Signatures per approval</div>
              <p className="text-xs text-mineshaft-400">
                How many signatures one approval is good for. Leave empty for unlimited.
              </p>
            </div>
          </div>
          <Input
            type="number"
            min={1}
            value={state.maxSignings ?? ""}
            onChange={(e) =>
              setState((prev) => ({
                ...prev,
                maxSignings: e.target.value ? Number(e.target.value) : null
              }))
            }
            placeholder="Unlimited"
            className="w-36"
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-mineshaft-300" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-mineshaft-100">Signing window</div>
              <p className="text-xs text-mineshaft-400">
                After approval is granted, how long signing is allowed before it expires.
              </p>
            </div>
          </div>
          <Select
            value={state.maxWindowDuration ?? NO_WINDOW_LIMIT}
            onValueChange={(v) =>
              setState((prev) => ({
                ...prev,
                maxWindowDuration: v === NO_WINDOW_LIMIT ? null : v
              }))
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
