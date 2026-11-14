import { useEffect, useRef, useState } from "react";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { type DataListItem, DataList } from "@infisical/cipher/ui/list";
import { MultiSelect } from "@infisical/cipher/ui/multi-select";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Separator } from "@infisical/cipher/ui/separator";
import { Heading } from "@infisical/cipher/ui/text";
import ms from "ms";

import {
  ApprovalPolicyType,
  ApproverType,
  type CertRequestPolicyConditions,
  type TApprovalPolicy
} from "@app/hooks/api/approvalPolicies/types";

import { readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

type StepDraft = {
  key: string;
  name: string;
  requiredApprovals: string;
  notifyApprovers: boolean;
  users: string[];
  groups: string[];
};

type Draft = {
  name: string;
  maxRequestTtl: string;
  profileNames: string[];
  bypassForMachineIdentities: boolean;
  steps: StepDraft[];
};

type Errors = {
  name?: string;
  maxRequestTtl?: string;
  profileNames?: string;
  steps?: string;
  stepErrors?: { name?: string; requiredApprovals?: string; approvers?: string }[];
};

const emptyStep = (): StepDraft => ({
  key: crypto.randomUUID(),
  name: "",
  requiredApprovals: "1",
  notifyApprovers: true,
  users: [],
  groups: []
});

const draftOf = (policy?: TApprovalPolicy): Draft => ({
  name: policy?.name ?? "",
  maxRequestTtl: policy?.maxRequestTtl ?? "",
  profileNames:
    (policy?.conditions.conditions as CertRequestPolicyConditions | undefined)?.[0]?.profileNames ??
    [],
  bypassForMachineIdentities: policy?.bypassForMachineIdentities ?? false,
  steps: policy?.steps.length
    ? policy.steps.map((step, index) => ({
        key: `step-${index}`,
        name: step.name ?? "",
        requiredApprovals: String(step.requiredApprovals),
        notifyApprovers: step.notifyApprovers ?? true,
        users: step.approvers.filter(({ type }) => type === ApproverType.User).map(({ id }) => id),
        groups: step.approvers.filter(({ type }) => type === ApproverType.Group).map(({ id }) => id)
      }))
    : [emptyStep()]
});

const ttlError = (value: string) => {
  if (!value) return undefined;
  const seconds = Number(ms(value)) / 1000;
  return seconds >= 86400 && seconds <= 2592000
    ? undefined
    : "Duration must be between 1 day and 30 days";
};

const configurationErrors = (draft: Draft): Errors => ({
  name: !draft.name.trim()
    ? "Policy name is required"
    : (draft.name.length > 128 && "Policy name must be 128 characters or fewer") || undefined,
  maxRequestTtl: ttlError(draft.maxRequestTtl),
  profileNames: draft.profileNames.length ? undefined : "Must have at least one profile"
});

const stepErrors = (draft: Draft): Errors => {
  const perStep = draft.steps.map((step) => {
    const required = Number(step.requiredApprovals);
    return {
      name: step.name.length > 128 ? "Step name must be 128 characters or fewer" : undefined,
      requiredApprovals:
        Number.isInteger(required) && required >= 1 && required <= 100
          ? undefined
          : "Enter a number from 1 to 100",
      approvers:
        step.users.length + step.groups.length ? undefined : "At least one approver is required"
    };
  });
  return {
    steps: draft.steps.length ? undefined : "At least one approval step is required",
    stepErrors: perStep
  };
};

const hasErrors = (errors: Errors) =>
  Boolean(
    errors.name ||
    errors.maxRequestTtl ||
    errors.profileNames ||
    errors.steps ||
    errors.stepErrors?.some((step) => Object.values(step).some(Boolean))
  );

export const PolicySheet = ({
  projectId,
  policy,
  onClose
}: {
  projectId: string;
  policy?: TApprovalPolicy;
  onClose: () => void;
}) => {
  const approvals = useV4Adapter("approvalRequests");
  const update = approvals.useUpdatePolicy();
  const { data: profileData } = useV4Adapter("certificates").useCertificateProfiles({});
  const { data: directory } = approvals.useApprovers(projectId, { includeGroupMembers: false });
  const [draft, setDraft] = useState<Draft>(() => draftOf(policy));
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const completed = useRef(false);
  const initial = useRef(draftOf(policy));

  useEffect(() => {
    const next = draftOf(policy);
    initial.current = next;
    setDraft(next);
    setErrors({});
    setStep(0);
  }, [policy]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial.current);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const setStepField = <K extends keyof StepDraft>(index: number, key: K, value: StepDraft[K]) =>
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((entry, at) => (at === index ? { ...entry, [key]: value } : entry))
    }));
  const check = (next: Errors) => {
    setErrors(next);
    return !hasErrors(next);
  };
  const profileOptions = [
    ...new Set([
      ...(profileData?.certificateProfiles ?? []).map((profile) => profile.slug),
      ...draft.profileNames
    ])
  ].map((slug) => ({ value: slug, label: slug }));
  const userOptions = (directory?.users ?? []).map(({ id, label }) => ({ value: id, label }));
  const groupOptions = (directory?.groups ?? []).map(({ id, label }) => ({ value: id, label }));
  const nameOf = (options: { value: string; label: string }[], id: string) =>
    options.find((option) => option.value === id)?.label ?? id;
  const close = () => {
    setStep(0);
    onClose();
  };
  const review: DataListItem[] = [
    ["Policy name", draft.name || "Not set"],
    ["Max. request TTL", draft.maxRequestTtl || "Not set", { span: "half" }],
    [
      "Machine identity bypass",
      draft.bypassForMachineIdentities ? "Enabled" : "Disabled",
      { span: "half" }
    ],
    ["Certificate profiles", draft.profileNames.length ? draft.profileNames.join(", ") : "Not set"],
    ...draft.steps.map((entry, index): DataListItem => [
      entry.name ? `Step ${index + 1}: ${entry.name}` : `Step ${index + 1}`,
      [
        `Requires ${entry.requiredApprovals} approval${entry.requiredApprovals === "1" ? "" : "s"}`,
        entry.users.length
          ? `Users: ${entry.users.map((id) => nameOf(userOptions, id)).join(", ")}`
          : "",
        entry.groups.length
          ? `Groups: ${entry.groups.map((id) => nameOf(groupOptions, id)).join(", ")}`
          : ""
      ]
        .filter(Boolean)
        .join(". ")
    ])
  ];
  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title="Edit certificate approval policy"
        open={Boolean(policy)}
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) return;
          if (completed.current) {
            completed.current = false;
            close();
            return;
          }
          if (dirty) {
            setStep(step);
            setDiscarding(true);
            return;
          }
          close();
        }}
        completeLabel="Update"
        onComplete={async () => {
          if (!policy) return;
          const conditions = (policy.conditions.conditions as CertRequestPolicyConditions).slice(1);
          await update
            .mutateAsync({
              policyType: ApprovalPolicyType.CertRequest,
              policyId: policy.id,
              name: draft.name.trim(),
              maxRequestTtl: draft.maxRequestTtl || null,
              conditions: [{ profileNames: draft.profileNames }, ...conditions],
              constraints: {},
              bypassForMachineIdentities: draft.bypassForMachineIdentities,
              steps: draft.steps.map((entry) => ({
                name: entry.name.trim() || null,
                requiredApprovals: Number(entry.requiredApprovals),
                notifyApprovers: entry.notifyApprovers,
                approvers: [
                  ...entry.users.map((id) => ({ type: ApproverType.User, id })),
                  ...entry.groups.map((id) => ({ type: ApproverType.Group, id }))
                ]
              }))
            })
            .catch(readableFailure("Could not update the policy."));
          saved("Policy updated");
          completed.current = true;
        }}
        steps={[
          {
            title: "Configuration",
            summary: draft.name || undefined,
            validate: () => check(configurationErrors(draft)),
            content: (
              <Stack gap={16}>
                <Field label="Policy name" error={errors.name} wide>
                  <Input
                    value={draft.name}
                    invalid={Boolean(errors.name)}
                    placeholder="Production TLS"
                    autoComplete="off"
                    onChange={(event) => set("name", event.target.value)}
                  />
                </Field>
                <Field
                  label="Max. request TTL"
                  optional
                  description="How long a request can stay pending, from 1 day to 30 days."
                  error={errors.maxRequestTtl}
                  wide
                >
                  <Input
                    mono
                    value={draft.maxRequestTtl}
                    invalid={Boolean(errors.maxRequestTtl)}
                    placeholder="7d"
                    autoComplete="off"
                    onChange={(event) => set("maxRequestTtl", event.target.value)}
                  />
                </Field>
                <Field
                  label="Certificate profiles"
                  description="The policy applies to certificates issued from these profiles."
                  error={errors.profileNames}
                  wide
                >
                  <MultiSelect
                    label="Certificate profiles"
                    placeholder="Select certificate profiles"
                    searchable
                    invalid={Boolean(errors.profileNames)}
                    options={profileOptions}
                    value={draft.profileNames}
                    onChange={(value) => set("profileNames", value)}
                  />
                </Field>
                <Checkbox
                  label="Bypass approval for machine identities"
                  description="Machine identities can issue certificates without approval."
                  checked={draft.bypassForMachineIdentities}
                  onChange={(checked) => set("bypassForMachineIdentities", checked === true)}
                />
              </Stack>
            )
          },
          {
            title: "Approval sequence",
            summary: `${draft.steps.length} step${draft.steps.length === 1 ? "" : "s"}`,
            validate: () => check(stepErrors(draft)),
            content: (
              <Stack gap={24}>
                {draft.steps.map((entry, index) => {
                  const stepError = errors.stepErrors?.[index];
                  return (
                    <Stack key={entry.key} gap={16}>
                      {index > 0 && <Separator />}
                      <Inline gap={8} align="center" justify="between">
                        <Heading level={3} size="subsection">
                          {`Step ${index + 1}`}
                        </Heading>
                        <Button
                          variant="ghost"
                          size="icon"
                          icon="trash"
                          iconOnly
                          disabledReason={
                            draft.steps.length > 1 ? undefined : "A policy needs at least one step"
                          }
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              steps: current.steps.filter((_, at) => at !== index)
                            }))
                          }
                        >
                          {`Remove step ${index + 1}`}
                        </Button>
                      </Inline>
                      <Field label="Step name" optional error={stepError?.name} wide>
                        <Input
                          value={entry.name}
                          invalid={Boolean(stepError?.name)}
                          placeholder="Security team review"
                          autoComplete="off"
                          onChange={(event) => setStepField(index, "name", event.target.value)}
                        />
                      </Field>
                      <Field
                        label="Required approvals"
                        description="Between 1 and 100."
                        error={stepError?.requiredApprovals}
                        wide
                      >
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={entry.requiredApprovals}
                          invalid={Boolean(stepError?.requiredApprovals)}
                          onChange={(event) =>
                            setStepField(index, "requiredApprovals", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="User approvers" error={stepError?.approvers} wide>
                        <MultiSelect
                          label="User approvers"
                          placeholder="Select users"
                          searchable
                          invalid={Boolean(stepError?.approvers)}
                          options={userOptions}
                          value={entry.users}
                          onChange={(value) => setStepField(index, "users", value)}
                        />
                      </Field>
                      <Field label="Group approvers" wide>
                        <MultiSelect
                          label="Group approvers"
                          placeholder="Select groups"
                          searchable
                          invalid={Boolean(stepError?.approvers)}
                          options={groupOptions}
                          value={entry.groups}
                          onChange={(value) => setStepField(index, "groups", value)}
                        />
                      </Field>
                    </Stack>
                  );
                })}
                <div>
                  <Button
                    variant="outline"
                    icon="plus"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        steps: [...current.steps, emptyStep()]
                      }))
                    }
                  >
                    Add step
                  </Button>
                </div>
              </Stack>
            )
          },
          {
            title: "Review",
            content: <DataList variant="props" density="compact" items={review} />
          }
        ]}
      />
      <DiscardChangesAlertDialog
        open={discarding}
        onOpenChange={setDiscarding}
        onDiscard={() => {
          setDiscarding(false);
          close();
        }}
        description="Your unsaved policy changes will be lost."
      />
    </>
  );
};
