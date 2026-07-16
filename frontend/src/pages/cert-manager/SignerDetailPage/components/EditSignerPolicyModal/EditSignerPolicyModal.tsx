import { useEffect, useMemo, useState } from "react";
import { ShieldIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import {
  SignerMemberRole,
  TSignerPolicy,
  useListSignerMembers,
  useUpdateSignerPolicy
} from "@app/hooks/api/signers";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { ApproversStep } from "./ApproversStep";
import { LimitsStep } from "./LimitsStep";
import {
  approverKey,
  ApproverKind,
  ApproverOption,
  APPROVERS_STEP,
  LIMITS_STEP,
  newStepDraft,
  StepDraft
} from "./types";

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  signerId: string;
  existingPolicy: TSignerPolicy | undefined;
};

export const EditSignerPolicyModal = ({
  isOpen,
  onOpenChange,
  signerId,
  existingPolicy
}: Props) => {
  const users = useListSignerMembers({ signerId, kind: "user" });
  const groups = useListSignerMembers({ signerId, kind: "group" });
  const updatePolicy = useUpdateSignerPolicy();

  const [step, setStep] = useState(0);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [maxSignings, setMaxSignings] = useState<number | null>(null);
  const [maxWindow, setMaxWindow] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showLimitsError, setShowLimitsError] = useState(false);

  const approverOptions = useMemo<ApproverOption[]>(() => {
    const userOpts: ApproverOption[] = (users.data?.memberships ?? [])
      .filter((m) => m.actorUserId && (m.role as SignerMemberRole) !== SignerMemberRole.Auditor)
      .map((m) => ({
        value: m.actorUserId as string,
        label:
          m.details?.name || m.details?.username || m.details?.email || (m.actorUserId as string),
        kind: "user" as const
      }));
    const groupOpts: ApproverOption[] = (groups.data?.memberships ?? [])
      .filter((m) => m.actorGroupId && (m.role as SignerMemberRole) !== SignerMemberRole.Auditor)
      .map((m) => ({
        value: m.actorGroupId as string,
        label: m.details?.name || m.details?.slug || (m.actorGroupId as string),
        kind: "group" as const
      }));
    return [...userOpts, ...groupOpts];
  }, [users.data, groups.data]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    if (existingPolicy && existingPolicy.steps.length > 0) {
      const labelLookup = new Map(
        approverOptions.map((o) => [approverKey(o.kind, o.value), o.label])
      );
      setSteps(
        existingPolicy.steps.map((s) => ({
          key: crypto.randomUUID(),
          name: s.name ?? "",
          approvers: s.approvers
            .filter((a) => a.type === "user" || a.type === "group")
            .map<ApproverOption>((a) => {
              const kind = a.type as ApproverKind;
              return {
                value: a.id,
                label: labelLookup.get(approverKey(kind, a.id)) ?? a.id,
                kind
              };
            }),
          requiredApprovals: s.requiredApprovals
        }))
      );
      setMaxSignings(existingPolicy.constraints.maxSignings ?? null);
      setMaxWindow(existingPolicy.constraints.maxWindowDuration ?? null);
    } else {
      setSteps([]);
      setMaxSignings(null);
      setMaxWindow(null);
    }
    setShowLimitsError(false);
  }, [isOpen, existingPolicy]);

  useEffect(() => {
    if (maxSignings != null || maxWindow != null) setShowLimitsError(false);
  }, [maxSignings, maxWindow]);

  useEffect(() => {
    if (!isOpen || approverOptions.length === 0) return;
    const lookup = new Map(approverOptions.map((o) => [approverKey(o.kind, o.value), o.label]));
    setSteps((prev) =>
      prev.map((stp) => {
        let changed = false;
        const patched = stp.approvers.map((a) => {
          if (a.label !== a.value) return a;
          const resolved = lookup.get(approverKey(a.kind, a.value));
          if (!resolved || resolved === a.label) return a;
          changed = true;
          return { ...a, label: resolved };
        });
        return changed ? { ...stp, approvers: patched } : stp;
      })
    );
  }, [isOpen, approverOptions]);

  const addStep = () => setSteps((prev) => [...prev, newStepDraft()]);
  const removeStep = (key: string) => setSteps((prev) => prev.filter((s) => s.key !== key));
  const updateStep = (key: string, patch: Partial<StepDraft>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const handleClose = (open: boolean) => {
    if (!open) setStep(0);
    onOpenChange(open);
  };

  const totalApprovers = steps.reduce((sum, s) => sum + s.approvers.length, 0);
  const firstEmptyStepIndex = steps.findIndex((s) => s.approvers.length === 0);
  const hasEmptyStep = firstEmptyStepIndex >= 0;
  const firstOverCommittedStepIndex = steps.findIndex((s) => {
    if (s.approvers.length === 0) return false;
    const userCount = s.approvers.filter((a) => a.kind === "user").length;
    const groupCount = s.approvers.length - userCount;
    return groupCount === 0 && s.requiredApprovals > userCount;
  });
  const hasOverCommittedStep = firstOverCommittedStepIndex >= 0;
  const stepOneInvalid = hasEmptyStep || hasOverCommittedStep;

  const WIZARD_STEPS = steps.length > 0 ? [APPROVERS_STEP, LIMITS_STEP] : [APPROVERS_STEP];
  const safeStep = Math.min(step, WIZARD_STEPS.length - 1);

  const limitsInvalid = steps.length > 0 && maxSignings == null && maxWindow == null;

  const onSave = async () => {
    if (limitsInvalid) {
      setShowLimitsError(true);
      if (safeStep !== 1) setStep(1);
      return;
    }
    const invalidStepIndex = steps.findIndex((s) => {
      if (s.approvers.length === 0) return true;
      if (s.requiredApprovals < 1) return true;
      const userCount = s.approvers.filter((a) => a.kind === "user").length;
      const groupCount = s.approvers.length - userCount;
      return groupCount === 0 && s.requiredApprovals > userCount;
    });
    if (invalidStepIndex !== -1) {
      const s = steps[invalidStepIndex];
      const userCount = s.approvers.filter((a) => a.kind === "user").length;
      if (s.approvers.length === 0) {
        createNotification({
          type: "error",
          text: `Step ${invalidStepIndex + 1}: pick at least one approver.`
        });
      } else if (s.requiredApprovals < 1) {
        createNotification({
          type: "error",
          text: `Step ${invalidStepIndex + 1}: required approvals must be at least 1.`
        });
      } else {
        createNotification({
          type: "error",
          text: `Step ${invalidStepIndex + 1}: required approvals (${s.requiredApprovals}) can't exceed ${userCount} approver${userCount === 1 ? "" : "s"}. Add a group to allow more.`
        });
      }
      return;
    }

    setSubmitting(true);
    try {
      await updatePolicy.mutateAsync({
        signerId,
        steps:
          steps.length === 0
            ? []
            : steps.map((s, i) => ({
                stepNumber: i + 1,
                name: s.name.trim() || null,
                requiredApprovals: s.requiredApprovals,
                approverUserIds: s.approvers.filter((a) => a.kind === "user").map((a) => a.value),
                approverGroupIds: s.approvers.filter((a) => a.kind === "group").map((a) => a.value)
              })),
        constraints: steps.length === 0 ? undefined : { maxSignings, maxWindowDuration: maxWindow }
      });
      handleClose(false);
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to save policy"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isLast = safeStep === WIZARD_STEPS.length - 1;
  const showLimitsTab = safeStep === 1;

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning">
                <ShieldIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">
                  Edit approval policy
                  <DocumentationLinkBadge href={PkiDocsUrls.codeSigning.approvals.policy} />
                </div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  Choose who approves, and how much each approval gives.
                </p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
              <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                Setup steps
              </p>
              <Stepper
                activeStep={safeStep}
                orientation="vertical"
                onStepChange={(i) => {
                  if (i < safeStep) setStep(i);
                }}
              >
                <StepperList>
                  {WIZARD_STEPS.map((s, i) => (
                    <StepperStep key={s.title} index={i} title={s.title} description={s.subtitle} />
                  ))}
                </StepperList>
              </Stepper>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
              {!showLimitsTab ? (
                <ApproversStep
                  steps={steps}
                  approverOptions={approverOptions}
                  onAddStep={addStep}
                  onRemoveStep={removeStep}
                  onUpdateStep={updateStep}
                />
              ) : (
                <LimitsStep
                  maxSignings={maxSignings}
                  setMaxSignings={setMaxSignings}
                  maxWindow={maxWindow}
                  setMaxWindow={setMaxWindow}
                  showError={showLimitsError && limitsInvalid}
                />
              )}
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div className="mb-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                    Step {safeStep + 1} · {WIZARD_STEPS[safeStep].title.toUpperCase()}
                  </p>
                  <DocumentationLinkBadge href={WIZARD_STEPS[safeStep].docsUrl} />
                </div>
                <p className="mt-4 text-sm font-semibold text-foreground">What this step does</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {!showLimitsTab
                    ? 'Approvals run in order. Each step has its own approvers and a "required" count: the number of approvers that must approve before moving on.'
                    : "Limits decide how many signatures one approval can make and how long it stays valid before expiring."}
                </p>
              </div>
            </aside>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
            <span className="text-xs text-muted">
              {/* eslint-disable-next-line no-nested-ternary */}
              {hasEmptyStep
                ? `Step ${firstEmptyStepIndex + 1} needs at least one approver, or remove it.`
                : // eslint-disable-next-line no-nested-ternary
                  hasOverCommittedStep
                  ? `Step ${firstOverCommittedStepIndex + 1}: required approvals can't exceed the number of approvers. Add a group to allow more.`
                  : // eslint-disable-next-line no-nested-ternary
                    steps.length === 0
                    ? "Approval is not configured"
                    : `${steps.length} step${steps.length === 1 ? "" : "s"} · ${totalApprovers} approver${
                        totalApprovers === 1 ? "" : "s"
                      }`}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">
                Step {safeStep + 1} of {WIZARD_STEPS.length}
              </span>
              {safeStep > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              )}
              {!isLast ? (
                <Button
                  variant="project"
                  onClick={() => setStep((s) => s + 1)}
                  isDisabled={stepOneInvalid}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  variant="project"
                  onClick={onSave}
                  isPending={submitting}
                  isDisabled={stepOneInvalid}
                >
                  Save policy
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
