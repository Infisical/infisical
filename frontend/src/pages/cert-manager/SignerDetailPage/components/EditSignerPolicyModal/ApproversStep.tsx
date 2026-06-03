import { ArrowDownIcon, InfoIcon, PlusIcon, ShieldIcon, XIcon } from "lucide-react";

import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input
} from "@app/components/v3";

import { approverKey, ApproverOption, StepDraft } from "./types";

type Props = {
  steps: StepDraft[];
  approverOptions: ApproverOption[];
  onAddStep: () => void;
  onRemoveStep: (key: string) => void;
  onUpdateStep: (key: string, patch: Partial<StepDraft>) => void;
};

export const ApproversStep = ({
  steps,
  approverOptions,
  onAddStep,
  onRemoveStep,
  onUpdateStep
}: Props) => (
  <>
    <h2 className="text-xl font-semibold text-mineshaft-100">Approval policy</h2>
    <p className="mt-1 mb-4 text-sm text-mineshaft-300">
      Add approvers if signing should require approval. Otherwise members can sign directly.
    </p>

    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-mineshaft-100">Approves</p>
        <p className="mt-0.5 text-xs text-mineshaft-300">
          Approvals run in order. Each step needs the listed number of approvers to approve.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onAddStep}>
        <PlusIcon className="h-3.5 w-3.5" />
        <span>Add step</span>
      </Button>
    </div>

    {steps.length === 0 ? (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-mineshaft-700 p-8 text-center">
        <ShieldIcon className="h-5 w-5 text-mineshaft-500" />
        <p className="text-sm text-mineshaft-300">No approval steps. Members can sign directly.</p>
        <Button variant="outline" size="sm" onClick={onAddStep}>
          <PlusIcon className="h-3.5 w-3.5" />
          <span>Add a step</span>
        </Button>
      </div>
    ) : (
      <div className="space-y-3">
        {steps.map((s, idx) => (
          <div key={s.key}>
            {idx > 0 && (
              <div className="flex justify-center py-1">
                <ArrowDownIcon className="h-4 w-4 text-mineshaft-500" />
              </div>
            )}
            <div className="rounded-md border border-mineshaft-700 bg-mineshaft-900/40 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-mineshaft-800 text-[11px] font-medium text-muted">
                  {idx + 1}
                </div>
                <Input
                  placeholder="Step name (e.g. Engineering lead)"
                  value={s.name}
                  onChange={(e) => onUpdateStep(s.key, { name: e.target.value })}
                  className="flex-1"
                />
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label="Remove step"
                  onClick={() => onRemoveStep(s.key)}
                >
                  <XIcon className="h-4 w-4" />
                </IconButton>
              </div>
              <FieldGroup className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="md:col-span-2">
                  <Field>
                    <FieldLabel>Approvers</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        isMulti
                        options={approverOptions}
                        groupBy="kind"
                        getGroupHeaderLabel={(g) => (g === "group" ? "Groups" : "Users")}
                        getOptionValue={(o) =>
                          approverKey((o as ApproverOption).kind, (o as ApproverOption).value)
                        }
                        isOptionSelected={(o) => {
                          const opt = o as ApproverOption;
                          return s.approvers.some(
                            (a) => a.kind === opt.kind && a.value === opt.value
                          );
                        }}
                        value={s.approvers}
                        onChange={(selected) => {
                          const opts = (selected ?? []) as ApproverOption[];
                          onUpdateStep(s.key, { approvers: opts });
                        }}
                        placeholder="Pick approvers from members..."
                        noOptionsMessage={() => "No eligible members"}
                      />
                      <FieldDescription>Approvers must already be members.</FieldDescription>
                    </FieldContent>
                  </Field>
                </div>
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
                        onUpdateStep(s.key, { requiredApprovals: n });
                      }}
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </div>
          </div>
        ))}

        <p className="flex items-center gap-1.5 text-xs text-mineshaft-400">
          <InfoIcon className="h-3.5 w-3.5" />
          You can add or change approvers any time.
        </p>
      </div>
    )}
  </>
);
