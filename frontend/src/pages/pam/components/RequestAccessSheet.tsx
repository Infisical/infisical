import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Clock,
  GitBranch,
  KeyRound,
  ListChecks,
  Rocket,
  Send,
  ShieldAlert,
  User as UserIcon,
  Users as UsersIcon
} from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextArea
} from "@app/components/v3";
import {
  PamAccessStatus,
  PamAccessType,
  PamAccountType,
  PamApproverType,
  TAccessiblePamAccount,
  TPamApprovalWorkflowStep,
  useBreakGlassPamAccessRequest,
  useCreatePamAccessRequest,
  useGetPamAccountApprovers
} from "@app/hooks/api/pam";

import { AccessTypeBadge } from "./AccessTypeBadge";
import { useAccountSheetDetails } from "./accountSheetDetails";
import { PamDetailSheet } from "./PamDetailSheet";

// Mirrors the membership expiry picker options, capped at the default 7d policy maximum and
// without "No expiry" since every approved access must be time-boxed.
const DURATION_OPTIONS = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" }
];

// Reason requiredness follows the template's Require Reason policy, same as the API and CLI
const makeSchema = (requireReason: boolean) =>
  z.object({
    duration: z.string().min(1, "Required"),
    reason: requireReason
      ? z.string().trim().min(1, "Required").max(500)
      : z.string().trim().max(500)
  });

type FormData = z.infer<ReturnType<typeof makeSchema>>;

type Props = {
  account: TAccessiblePamAccount | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  accessType?: PamAccessType;
};

const ApproverChip = ({
  approver
}: {
  approver: TPamApprovalWorkflowStep["approvers"][number];
}) => {
  const Icon = approver.type === PamApproverType.Group ? UsersIcon : UserIcon;
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-border bg-popover px-2.5 py-1 text-xs text-foreground">
      <Icon className="size-3.5 text-muted" />
      {approver.name}
      {approver.type === PamApproverType.Group && approver.memberCount !== undefined && (
        <span className="text-muted">· {approver.memberCount}</span>
      )}
    </span>
  );
};

const ApprovalWorkflow = ({
  accountId,
  isPending,
  accessType
}: {
  accountId?: string;
  isPending: boolean;
  accessType: PamAccessType;
}) => {
  const { data: steps } = useGetPamAccountApprovers(accountId, accessType);
  if (!steps?.length) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <GitBranch className="size-4 text-muted" />
        Approval workflow · {steps.length} step{steps.length > 1 ? "s" : ""}
      </div>
      <div className="flex flex-col gap-3">
        {steps.map((step, idx) => (
          // Steps are ordered and have no natural id; index is the step number
          // eslint-disable-next-line react/no-array-index-key
          <div key={idx} className="flex gap-3.5 rounded-md border border-border bg-container p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-danger/40 bg-danger/10">
              <Clock className="size-4 text-danger" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-semibold tracking-wide text-muted">
                  STEP {idx + 1}
                </span>
                {isPending && (
                  <Badge variant="warning">
                    <Clock className="mr-1 size-3" />
                    Awaiting
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                <ListChecks className="size-3.5" />
                {step.requiredApprovals <= 1
                  ? "any one approves"
                  : `${step.requiredApprovals} approvals required`}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {step.approvers.map((approver) => (
                  <ApproverChip key={`${approver.type}-${approver.name}`} approver={approver} />
                ))}
              </div>
              {isPending && (
                <p className="mt-2.5 text-xs text-muted">Waiting on the approvers above.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const RequestAccessSheet = ({
  account,
  isOpen,
  onOpenChange,
  accessType = PamAccessType.Session
}: Props) => {
  const { typeName, subtitle, metadata } = useAccountSheetDetails(account, isOpen);
  const createRequest = useCreatePamAccessRequest();
  const breakGlass = useBreakGlassPamAccessRequest();
  const [bypassReason, setBypassReason] = useState("");
  const isCredentialRequest = accessType === PamAccessType.Credential;
  const isPending =
    (isCredentialRequest ? account?.credentialAccessStatus : account?.accessStatus) ===
    PamAccessStatus.Pending;
  // Session and credential requests are separate rows, so break glass on the one this sheet is for.
  const pendingRequestId = isCredentialRequest
    ? account?.credentialPendingRequestId
    : account?.pendingRequestId;
  const canBreakGlass = Boolean(account?.canBreakGlass && pendingRequestId);
  const requireReason = Boolean(account?.requireReason);
  const schema = useMemo(() => makeSchema(requireReason), [requireReason]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { duration: "1h", reason: "" }
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      reset();
      setBypassReason("");
    }
    onOpenChange(open);
  };

  const onBreakGlass = () => {
    if (!pendingRequestId) return;
    breakGlass.mutate(
      { requestId: pendingRequestId, bypassReason: bypassReason.trim() },
      {
        onSuccess: () => {
          createNotification({
            text: "Access granted. The approvers you skipped have been notified.",
            type: "success"
          });
          setBypassReason("");
          onOpenChange(false);
        }
      }
    );
  };

  const onSubmit = (data: FormData) => {
    if (!account) return;
    createRequest.mutate(
      {
        accountId: account.id,
        duration: data.duration,
        reason: data.reason || undefined,
        accessType
      },
      {
        onSuccess: () => {
          createNotification({
            text: isCredentialRequest
              ? "Credential access request submitted"
              : "Access request submitted",
            type: "success"
          });
          reset();
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <PamDetailSheet
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      isLoading={!account}
      accountType={account?.accountType as PamAccountType}
      title={account?.name}
      subtitle={subtitle}
      typeBadge={typeName}
      badges={<AccessTypeBadge accessType={accessType} />}
      metadata={metadata}
      isDirty={isDirty && !isPending}
    >
      <div className="flex h-full flex-1 flex-col p-6">
        {isPending ? (
          <div className="flex flex-1 flex-col gap-6">
            <div className="flex items-center gap-2.5 rounded-md border border-border bg-container px-4 py-3">
              <Clock className="size-4 shrink-0 text-warning" />
              <p className="text-sm text-foreground">
                {isCredentialRequest
                  ? "Your credential request is awaiting approval."
                  : "Your access request is awaiting approval."}
              </p>
            </div>
            <ApprovalWorkflow accountId={account?.id} isPending accessType={accessType} />
            {canBreakGlass && (
              <Card>
                <CardHeader className="border-b">
                  <CardTitle className="text-base">
                    <ShieldAlert className="size-4 shrink-0 text-danger" />
                    Break glass
                  </CardTitle>
                  <CardDescription>
                    Grant yourself access now without waiting for an approver. Use this only in an
                    emergency: the approvers above are notified immediately and the reason you give
                    is recorded in the audit log.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Field>
                    <FieldLabel>
                      Reason <span className="text-danger">*</span>
                    </FieldLabel>
                    <FieldContent>
                      <TextArea
                        rows={3}
                        value={bypassReason}
                        onChange={(e) => setBypassReason(e.target.value)}
                        placeholder="Why can this not wait for an approver?"
                      />
                      <FieldDescription>At least 10 characters.</FieldDescription>
                    </FieldContent>
                  </Field>
                  <Button
                    variant="danger"
                    className="self-end"
                    isDisabled={bypassReason.trim().length < 10}
                    isPending={breakGlass.isPending}
                    onClick={onBreakGlass}
                  >
                    Break glass
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col gap-6">
              {isCredentialRequest ? (
                <Alert variant="warning">
                  <KeyRound />
                  <AlertTitle>You are requesting the stored credential</AlertTitle>
                  <AlertDescription>
                    Once approved you can read this account&apos;s password or key directly. That
                    happens outside a session, so nothing is recorded, and a credential you copy
                    stays valid until the account is rotated.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="info">
                  <Rocket />
                  <AlertTitle>You are requesting session access</AlertTitle>
                  <AlertDescription>
                    Once approved you can launch sessions on this account. The credential is
                    injected for you and never shown, and the session is recorded.
                  </AlertDescription>
                </Alert>
              )}
              <Controller
                control={control}
                name="reason"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>
                      Reason {requireReason && <span className="text-danger">*</span>}
                    </FieldLabel>
                    <FieldContent>
                      <TextArea
                        {...field}
                        rows={4}
                        placeholder={
                          isCredentialRequest
                            ? "Why do you need this account's credentials?"
                            : "What are you working on?"
                        }
                        isError={!!fieldState.error}
                      />
                      <FieldDescription>
                        Will be visible to approvers and recorded in audit logs.
                      </FieldDescription>
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="duration"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>
                      {isCredentialRequest ? "How long you need it" : "Requested duration"}
                    </FieldLabel>
                    <FieldContent>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {DURATION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        {isCredentialRequest
                          ? "How long you can reveal the credential for."
                          : "How long you can launch sessions for once approved."}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />
              <ApprovalWorkflow accountId={account?.id} isPending={false} accessType={accessType} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="pam" isPending={createRequest.isPending}>
                <Send className="mr-1.5 size-4" />
                {isCredentialRequest ? "Request credentials" : "Request session access"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </PamDetailSheet>
  );
};
