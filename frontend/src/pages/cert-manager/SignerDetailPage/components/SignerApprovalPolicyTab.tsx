import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { PencilIcon, UsersIcon } from "lucide-react";

import {
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  SignerPermissionActions,
  SignerPermissionSub,
  useSignerPermission
} from "@app/context/SignerPermissionContext";
import { TSignerMember, useGetSignerPolicy, useListSignerMembers } from "@app/hooks/api/signers";

import { EditSignerPolicyModal } from "./EditSignerPolicyModal";

type Props = {
  signerId: string;
};

type ApproverDisplay = {
  id: string;
  label: string;
  kind: "user" | "group";
};

const labelForMember = (m: TSignerMember): string => {
  if (m.actorUserId) {
    return m.details?.name || m.details?.username || m.details?.email || m.actorUserId;
  }
  if (m.actorGroupId) {
    return m.details?.name || m.details?.slug || m.actorGroupId;
  }
  return m.actorIdentityId ?? "Unknown";
};

const initialsOf = (label: string): string => {
  const trimmed = label.trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
};

const ApproverAvatar = ({ approver }: { approver: ApproverDisplay }) => (
  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-mineshaft-700 bg-mineshaft-800 text-[10px] font-medium text-muted ring-1 ring-mineshaft-900">
    {approver.kind === "group" ? <UsersIcon className="h-3 w-3" /> : initialsOf(approver.label)}
  </span>
);

const StepName = ({ name }: { name: string }) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);

  const label = (
    <span ref={ref} className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
      {name}
    </span>
  );

  if (!isTruncated) return label;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent className="max-w-xs break-words">{name}</TooltipContent>
    </Tooltip>
  );
};

const ApproverStack = ({ approvers }: { approvers: ApproverDisplay[] }) => {
  if (!approvers.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex -space-x-2">
          {approvers.map((a) => (
            <ApproverAvatar key={`${a.kind}:${a.id}`} approver={a} />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="space-y-0.5">
          {approvers.map((a) => (
            <li key={`${a.kind}:${a.id}`} className="text-xs">
              {a.label}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
};

export const SignerApprovalPolicyTab = ({ signerId }: Props) => {
  const { data: policy, isLoading } = useGetSignerPolicy(signerId);
  const { permission } = useSignerPermission();
  const canManagePolicy = permission.can(
    SignerPermissionActions.ManagePolicy,
    SignerPermissionSub.Signer
  );
  const users = useListSignerMembers({ signerId, kind: "user" });
  const groups = useListSignerMembers({ signerId, kind: "group" });
  const [isEditOpen, setIsEditOpen] = useState(false);

  const userLabels = useMemo(() => {
    const map = new Map<string, string>();
    (users.data?.memberships ?? []).forEach((m) => {
      if (m.actorUserId) map.set(m.actorUserId, labelForMember(m));
    });
    return map;
  }, [users.data]);

  const groupLabels = useMemo(() => {
    const map = new Map<string, string>();
    (groups.data?.memberships ?? []).forEach((m) => {
      if (m.actorGroupId) map.set(m.actorGroupId, labelForMember(m));
    });
    return map;
  }, [groups.data]);

  if (isLoading) return <PageLoader />;

  const constraints = policy?.constraints;
  const hasSteps = policy?.hasSteps ?? false;

  const resolveApprover = (a: { id: string; type: "user" | "group" }): ApproverDisplay => {
    if (a.type === "user") {
      return {
        id: a.id,
        label: userLabels.get(a.id) ?? `${a.id.slice(0, 8)}…`,
        kind: "user"
      };
    }
    return {
      id: a.id,
      label: groupLabels.get(a.id) ?? `${a.id.slice(0, 8)}…`,
      kind: "group"
    };
  };

  const stepsCount = policy?.steps.length ?? 0;

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg leading-none font-semibold text-foreground">
              Approval Policy
            </div>
            <p className="mt-1 text-sm text-accent">
              {hasSteps
                ? "Control when approval is required before signing."
                : "Approval is not configured. Members can sign directly."}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                aria-label="Edit policy"
                variant="ghost"
                onClick={() => setIsEditOpen(true)}
                isDisabled={!canManagePolicy}
              >
                <PencilIcon />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>Edit policy</TooltipContent>
          </Tooltip>
        </div>
        <CardContent>
          {hasSteps ? (
            <>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="w-fit cursor-help text-[11px] text-muted">Max signings</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      How many times one approval can be used to sign. Leave empty for unlimited.
                    </TooltipContent>
                  </Tooltip>
                  <p className="mt-0.5 text-xs text-foreground">
                    {constraints?.maxSignings ?? <span className="text-muted">Unlimited</span>}
                  </p>
                </div>
                <div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="w-fit cursor-help text-[11px] text-muted">Max window</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      After approval is granted, how long signing is allowed before it expires.
                    </TooltipContent>
                  </Tooltip>
                  <p className="mt-0.5 text-xs text-foreground">
                    {constraints?.maxWindowDuration ?? <span className="text-muted">No limit</span>}
                  </p>
                </div>
              </div>

              <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">
                Approval steps
              </div>
              <div>
                {policy?.steps.map((step, idx) => {
                  const approvers = step.approvers.map(resolveApprover);
                  const stepNumber = step.stepNumber ?? idx + 1;
                  const isLast = idx === stepsCount - 1;
                  return (
                    <div key={stepNumber} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-mineshaft-800 text-[10px] font-medium text-muted">
                          {stepNumber}
                        </span>
                        {!isLast && <span aria-hidden="true" className="w-px flex-1 bg-border" />}
                      </div>
                      <div
                        className={`flex min-w-0 flex-1 items-center gap-2 ${isLast ? "" : "pb-3"}`}
                      >
                        <StepName name={step.name ?? `Step ${stepNumber}`} />
                        <ApproverStack approvers={approvers} />
                        <span className="shrink-0 text-[11px] text-muted">
                          <span className="font-semibold text-foreground">
                            {step.requiredApprovals}
                          </span>{" "}
                          required
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty className="border border-solid">
              <EmptyHeader>
                <EmptyTitle>No approval steps</EmptyTitle>
                <EmptyDescription>
                  Add approvers in the editor to require approval before signing.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <EditSignerPolicyModal
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        signerId={signerId}
        existingPolicy={policy}
      />
    </>
  );
};
