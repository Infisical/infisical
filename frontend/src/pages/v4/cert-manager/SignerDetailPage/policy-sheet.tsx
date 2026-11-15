import { useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";

import { SignerMemberRole, type TSignerPolicy } from "@app/hooks/api/signers/types";

import { readableFailure } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import {
  type ApproverKind,
  approverKey,
  type ApproverOption,
  type PolicyLimits,
  PolicyLimitsFields,
  policyProblem,
  type PolicyStepDraft,
  PolicyStepsEditor,
  policyStepsPayload
} from "../CodeSigningPage/policy-editor";
import { CODE_SIGNING_DOCS, memberLabel } from "../CodeSigningPage/signer-shared";

const draftsFrom = (policy?: TSignerPolicy): PolicyStepDraft[] =>
  (policy?.steps ?? []).map((step, index) => ({
    key: crypto.randomUUID(),
    name: step.name ?? `Step ${index + 1}`,
    requiredApprovals: step.requiredApprovals,
    approvers: step.approvers
      .filter((approver) => approver.type === "user" || approver.type === "group")
      .map((approver) => approverKey(approver.type as ApproverKind, approver.id))
  }));

const limitsFrom = (policy?: TSignerPolicy): PolicyLimits =>
  policy?.steps.length
    ? {
        maxSignings: policy.constraints.maxSignings ?? null,
        maxWindowDuration: policy.constraints.maxWindowDuration ?? null
      }
    : { maxSignings: null, maxWindowDuration: null };

const PolicySheet = ({
  signerId,
  policy,
  onClose
}: {
  signerId: string;
  policy?: TSignerPolicy;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("codeSigning");
  const users = adapter.useSignerMembers({ signerId, kind: "user" });
  const groups = adapter.useSignerMembers({ signerId, kind: "group" });
  const update = adapter.useUpdateSignerPolicy();
  const [initialSteps] = useState(() => draftsFrom(policy));
  const [steps, setSteps] = useState(initialSteps);
  const [limits, setLimits] = useState(() => limitsFrom(policy));
  const [step, setStep] = useState(0);
  const [showLimitsError, setShowLimitsError] = useState(false);
  const submitting = useRef(false);
  const shape = (drafts: PolicyStepDraft[], nextLimits: PolicyLimits) =>
    JSON.stringify({
      steps: drafts.map(({ name, approvers, requiredApprovals }) => ({
        name,
        approvers,
        requiredApprovals
      })),
      limits: drafts.length ? nextLimits : null
    });
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: shape(steps, limits) !== shape(initialSteps, limitsFrom(policy)),
    onDiscard: onClose
  });

  const approverOptions: ApproverOption[] = [
    ...(users.data?.memberships ?? [])
      .filter((member) => member.actorUserId && member.role !== SignerMemberRole.Auditor)
      .map((member) => ({
        value: member.actorUserId as string,
        label: memberLabel(member),
        kind: "user" as const
      })),
    ...(groups.data?.memberships ?? [])
      .filter((member) => member.actorGroupId && member.role !== SignerMemberRole.Auditor)
      .map((member) => ({
        value: member.actorGroupId as string,
        label: memberLabel(member),
        kind: "group" as const
      }))
  ];
  const stepsProblem = policyProblem(steps, { maxSignings: 1, maxWindowDuration: null });
  const limitsMissing = steps.length > 0 && limits.maxSignings == null && !limits.maxWindowDuration;

  const save = async () => {
    if (limitsMissing) {
      setShowLimitsError(true);
      setStep(1);
      return;
    }
    submitting.current = true;
    try {
      await update
        .mutateAsync({
          signerId,
          steps: policyStepsPayload(steps),
          constraints: steps.length ? limits : undefined
        })
        .catch(readableFailure("Couldn't save the approval policy."));
      onClose();
    } finally {
      submitting.current = false;
    }
  };

  const approversStep: MultiStepStep = {
    title: "Approvers",
    summary: steps.length
      ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}`
      : "No approval",
    description:
      "Approvals run in order. Each step needs its required number of approvers to approve before moving on.",
    disabledReason: stepsProblem,
    content: (
      <PolicyStepsEditor
        steps={steps}
        onChange={setSteps}
        approverOptions={approverOptions}
        emptyApproversText="No eligible members. Add users or groups as administrators or operators first."
      />
    )
  };
  const limitsStep: MultiStepStep = {
    title: "Approval limits",
    description:
      "Limits decide how many signatures one approval allows and how long it stays valid. At least one is required.",
    content: (
      <PolicyLimitsFields
        limits={limits}
        onChange={(next) => {
          setLimits(next);
          setShowLimitsError(false);
        }}
        showError={showLimitsError && limitsMissing}
      />
    )
  };

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={policy?.hasSteps ? "Edit approval policy" : "Add approval policy"}
        description={
          <DocumentationLink href={CODE_SIGNING_DOCS.policy} subject="Signer approvals" />
        }
        open
        step={Math.min(step, steps.length ? 1 : 0)}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next || submitting.current) return;
          requestDiscard();
        }}
        completeLabel="Save policy"
        onComplete={save}
        steps={steps.length ? [approversStep, limitsStep] : [approversStep]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard changes?"
        description="Your approval policy changes will be lost."
      />
    </>
  );
};

export const SignerPolicySheet = ({
  open,
  signerId,
  policy,
  onClose
}: {
  open: boolean;
  signerId: string;
  policy?: TSignerPolicy;
  onClose: () => void;
}) => (open ? <PolicySheet signerId={signerId} policy={policy} onClose={onClose} /> : null);
