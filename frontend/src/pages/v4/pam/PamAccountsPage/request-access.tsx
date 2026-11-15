import { useEffect, useId, useReducer, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Switch } from "@infisical/cipher/ui/switch";
import { Meta, StatusText, Text } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";

import type {
  TAutoApprovalInputDetails,
  TAutoApprovalInputValue
} from "@app/hooks/api/approvalPolicies";
import {
  PamAccessStatus,
  PamAccessType,
  PamApproverType,
  PamFieldWidget,
  type TPamAccessRequest,
  type TPamAccountListItem,
  type TPamAccountTypeMetadata,
  type TPamApprovalWorkflowStep,
  type TPamFieldDescriptor
} from "@app/hooks/api/pam";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

const DURATION_OPTIONS = [
  { value: "15m", label: "15 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "4h", label: "4 hours" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" }
];

const BREAK_GLASS_MIN = 10;
const GRANTED_BY_BREAK_GLASS = "Access granted. The approvers you skipped have been notified.";

const inputKey = (input: { connectionId: string; subject: string }) =>
  `${input.connectionId}:${input.subject}`;

const toInputValues = (
  inputs: TAutoApprovalInputDetails[],
  values: Record<string, string>
): TAutoApprovalInputValue[] =>
  inputs
    .map((input) => ({
      connectionId: input.connectionId,
      subject: input.subject,
      value: values[inputKey(input)]?.trim() ?? ""
    }))
    .filter(({ value }) => value);

const detailValue = (field: TPamFieldDescriptor, value: unknown) => {
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (field.widget === PamFieldWidget.Textarea) return <Badge tone="ok">Configured</Badge>;
  return <MiddleTruncate text={String(value)} mono />;
};

const useAccountDetails = (account: TPamAccountListItem | null, meta?: TPamAccountTypeMetadata) => {
  const { data: full } = useV4Adapter("pam").useAccount(account?.id);
  if (!account) return [];
  const rows = (fields: TPamFieldDescriptor[] = [], source: Record<string, unknown> = {}) =>
    fields
      .filter(
        (field) =>
          !field.secret &&
          source[field.key] !== undefined &&
          source[field.key] !== null &&
          source[field.key] !== ""
      )
      .map((field): DataListItem => [field.label, detailValue(field, source[field.key])]);
  return [
    ...rows(meta?.connectionFields, full?.connectionDetails),
    ...rows(meta?.credentialFields, full?.credentials)
  ];
};

const AccessTypeBadge = ({ accessType }: { accessType: PamAccessType }) =>
  accessType === PamAccessType.Credential ? (
    <Badge tone="warn" icon="key">
      Credentials
    </Badge>
  ) : (
    <Badge tone="outline" icon="rocket">
      Session
    </Badge>
  );

const ApprovalWorkflow = ({
  steps,
  waiting
}: {
  steps: TPamApprovalWorkflowStep[];
  waiting: boolean;
}) => {
  if (!steps.length) return null;
  return (
    <Stack gap={8}>
      <Text>{`Approval workflow, ${steps.length} ${steps.length > 1 ? "steps" : "step"}`}</Text>
      {steps.map((step, index) => (
        <Card
          key={step.approvers.map(({ type, name }) => `${type}:${name}`).join(",")}
          size="sm"
          title={`Step ${index + 1}`}
          badges={
            waiting ? (
              <StatusText tone="warn" icon="clock">
                Awaiting
              </StatusText>
            ) : undefined
          }
        >
          <Stack gap={8}>
            <Meta mono={false}>
              {step.requiredApprovals <= 1
                ? "Any one approves"
                : `${step.requiredApprovals} approvals required`}
            </Meta>
            <Inline gap={8}>
              {step.approvers.map((approver) => (
                <Badge
                  key={`${approver.type}-${approver.name}`}
                  tone="outline"
                  icon={approver.type === PamApproverType.Group ? "users" : "user"}
                >
                  {approver.type === PamApproverType.Group && approver.memberCount !== undefined
                    ? `${approver.name}, ${approver.memberCount}`
                    : approver.name}
                </Badge>
              ))}
            </Inline>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
};

type RequestTarget = { account: TPamAccountListItem; accessType: PamAccessType };

const announceSubmission = (
  request: TPamAccessRequest | undefined,
  isCredential: boolean,
  isBreakGlass: boolean
) => {
  if (isBreakGlass) {
    saved(GRANTED_BY_BREAK_GLASS);
    return;
  }
  const outcome = request?.autoApproval;
  if (request?.autoApprovedAt) {
    const rule = outcome?.rules.find(({ id }) => id === outcome.approvedByRuleId);
    saved(`Access approved by the auto-approval rule "${rule?.name ?? "auto-approval"}"`);
    return;
  }
  const closest = outcome?.rules
    .map((rule) => ({
      rule,
      failedCount: rule.conditions.filter(({ passed }) => !passed).length,
      passedCount: rule.conditions.filter(({ passed }) => passed).length
    }))
    .sort((a, b) => a.failedCount - b.failedCount || b.passedCount - a.passedCount)[0]?.rule;
  const firstFailure = closest?.conditions.find(({ passed }) => !passed)?.reason;
  const submitted = isCredential
    ? "Credential access request submitted"
    : "Access request submitted";
  if (firstFailure)
    toast({ title: submitted, description: `It wasn't auto-approved: ${firstFailure}` });
  else saved(submitted);
};

const PendingRequest = ({
  isCredential,
  steps,
  canBreakGlass,
  bypassReason,
  onBypassReasonChange,
  pending,
  onBreakGlass
}: {
  isCredential: boolean;
  steps: TPamApprovalWorkflowStep[];
  canBreakGlass: boolean;
  bypassReason: string;
  onBypassReasonChange: (value: string) => void;
  pending: boolean;
  onBreakGlass: () => void;
}) => (
  <Stack gap={24}>
    <Alert
      tone="warn"
      title={
        isCredential
          ? "Your credential request is awaiting approval"
          : "Your access request is awaiting approval"
      }
    />
    <ApprovalWorkflow steps={steps} waiting />
    {canBreakGlass && (
      <Card
        title="Break glass"
        description="Grant yourself access now without waiting for an approver. The approvers above are notified and your reason is recorded in the audit log."
        footer={
          <Inline justify="end">
            <Button
              variant="destructive"
              loading={pending}
              disabledReason={
                bypassReason.trim().length < BREAK_GLASS_MIN
                  ? `Give a reason of at least ${BREAK_GLASS_MIN} characters`
                  : undefined
              }
              onClick={onBreakGlass}
            >
              Break glass
            </Button>
          </Inline>
        }
      >
        <Field label="Reason" description={`At least ${BREAK_GLASS_MIN} characters.`}>
          <Textarea
            rows={3}
            value={bypassReason}
            placeholder="Why can this not wait for an approver?"
            onChange={(event) => onBypassReasonChange(event.target.value)}
          />
        </Field>
      </Card>
    )}
  </Stack>
);

const AccessTypeNotice = ({ isCredential }: { isCredential: boolean }) =>
  isCredential ? (
    <Alert tone="warn" title="You are requesting the stored credential">
      Once approved you can read this account&apos;s password or key directly. That happens outside
      a session, so nothing is recorded, and a credential you copy stays valid until the account is
      rotated.
    </Alert>
  ) : (
    <Alert tone="info" title="You are requesting session access">
      Once approved you can launch sessions on this account. The credential is injected for you and
      never shown, and the session is recorded.
    </Alert>
  );

const AutoApprovalInputFields = ({
  inputs,
  values,
  onChange
}: {
  inputs: TAutoApprovalInputDetails[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) =>
  inputs.map((input) => {
    const key = inputKey(input);
    const ambiguous = inputs.filter(({ label }) => label === input.label).length > 1;
    return (
      <Field
        key={key}
        label={ambiguous ? `${input.label} from ${input.connectionName}` : input.label}
        optional
        description="Requests are approved instantly when the linked record passes this folder's auto-approval rules."
      >
        <Input
          maxLength={2048}
          placeholder={input.placeholder}
          value={values[key] ?? ""}
          onChange={(event) => onChange(key, event.target.value)}
        />
      </Field>
    );
  });

export const RequestAccessSheet = ({
  target,
  onOpenChange,
  onGranted
}: {
  target: RequestTarget | null;
  onOpenChange: (open: boolean) => void;
  onGranted: (target: RequestTarget) => void;
}) => {
  const pam = useV4Adapter("pam");
  const pamAccess = useV4Adapter("pamAccess");
  const formId = useId();
  const account = target?.account ?? null;
  const accessType = target?.accessType ?? PamAccessType.Session;
  const isCredential = accessType === PamAccessType.Credential;
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const meta = accountTypes.find(({ type }) => type === account?.accountType);
  const details = useAccountDetails(account, meta);
  const { data: approvers, isPending: approversPending } = pamAccess.useAccountApprovers(
    account?.id,
    accessType
  );
  const createRequest = pamAccess.useCreateAccessRequest();
  const breakGlass = pamAccess.useBreakGlass();
  const cancelRequest = pamAccess.useCancelAccessRequest();

  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("1h");
  const [bypassReason, setBypassReason] = useState("");
  const [breakGlassChosen, setBreakGlassChosen] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [reasonError, setReasonError] = useState<string>();
  const [pending, setPending] = useState(false);

  const isPending =
    (isCredential ? account?.credentialAccessStatus : account?.accessStatus) ===
    PamAccessStatus.Pending;
  const pendingRequestId = isCredential
    ? account?.credentialPendingRequestId
    : account?.pendingRequestId;
  const requireReason = Boolean(account?.requireReason);
  const isBreakGlassOnly = Boolean(
    account?.canBreakGlass &&
    approvers &&
    !approvers.autoApprovalOnly &&
    !approvers.steps.some((step) => step.approvers.length > 0)
  );
  const breakGlassOnSubmit = breakGlassChosen || isBreakGlassOnly;
  const inputs = approvers?.autoApprovalInputs ?? [];
  const dirty =
    !isPending &&
    Boolean(
      reason.trim() ||
      duration !== "1h" ||
      breakGlassChosen ||
      Object.values(inputValues).some((value) => value.trim())
    );

  const reset = () => {
    setReason("");
    setDuration("1h");
    setBypassReason("");
    setBreakGlassChosen(false);
    setInputValues({});
    setReasonError(undefined);
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };
  const guard = useDiscardChangesGuard({ isDirty: dirty, onDiscard: close });

  const submit = async () => {
    if (!account || !target) return;
    const trimmed = reason.trim();
    if (breakGlassOnSubmit && trimmed.length < BREAK_GLASS_MIN) {
      setReasonError(`At least ${BREAK_GLASS_MIN} characters for a break-glass request`);
      return;
    }
    if (requireReason && !trimmed) {
      setReasonError("Required");
      return;
    }
    const autoApprovalInputs = breakGlassOnSubmit ? [] : toInputValues(inputs, inputValues);
    setPending(true);
    try {
      const { request } = await createRequest.mutateAsync({
        accountId: account.id,
        duration,
        reason: trimmed || undefined,
        accessType,
        breakGlass: breakGlassOnSubmit || undefined,
        autoApprovalInputs: autoApprovalInputs.length ? autoApprovalInputs : undefined
      });
      announceSubmission(request, isCredential, breakGlassOnSubmit);
      close();
      if (breakGlassOnSubmit || request?.autoApprovedAt) onGranted(target);
    } catch (error) {
      failed("Failed to submit request", error);
    } finally {
      setPending(false);
    }
  };

  const runBreakGlass = async () => {
    if (!pendingRequestId || !target) return;
    setPending(true);
    try {
      await breakGlass.mutateAsync({
        requestId: pendingRequestId,
        bypassReason: bypassReason.trim()
      });
      saved(GRANTED_BY_BREAK_GLASS);
      close();
      onGranted(target);
    } catch (error) {
      failed("Failed to break glass", error);
    } finally {
      setPending(false);
    }
  };

  const runCancel = async () => {
    if (!pendingRequestId) return;
    setPending(true);
    try {
      await cancelRequest.mutateAsync({ requestId: pendingRequestId });
      saved(isCredential ? "Credential request canceled" : "Access request canceled");
      close();
    } catch (error) {
      failed("Failed to cancel request", error);
    } finally {
      setPending(false);
    }
  };

  const steps = approvers?.steps ?? [];
  let body = (
    <Stack gap={12}>
      <Skeleton height={64} />
      <Skeleton height={120} />
    </Stack>
  );
  if (account && !approversPending && isPending)
    body = (
      <PendingRequest
        isCredential={isCredential}
        steps={steps}
        canBreakGlass={Boolean(account.canBreakGlass && pendingRequestId)}
        bypassReason={bypassReason}
        onBypassReasonChange={setBypassReason}
        pending={pending}
        onBreakGlass={runBreakGlass}
      />
    );
  if (account && !approversPending && !isPending)
    body = (
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Stack gap={24}>
          <AccessTypeNotice isCredential={isCredential} />
          <Field
            label="Reason"
            optional={!requireReason && !breakGlassOnSubmit}
            error={reasonError}
            description={
              breakGlassOnSubmit
                ? "Sent to the approvers you skip and recorded in audit logs."
                : "Visible to approvers and recorded in audit logs."
            }
          >
            <Textarea
              rows={4}
              maxLength={500}
              value={reason}
              aria-invalid={Boolean(reasonError) || undefined}
              placeholder={
                isCredential
                  ? "Why do you need this account's credentials?"
                  : "What are you working on?"
              }
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(undefined);
              }}
            />
          </Field>
          <Field
            label={isCredential ? "How long you need it" : "Requested duration"}
            description={
              isCredential
                ? "How long you can reveal the credential for."
                : "How long you can launch sessions for once approved."
            }
          >
            <Select
              label="Duration"
              value={duration}
              options={DURATION_OPTIONS}
              onValueChange={setDuration}
            />
          </Field>
          {!breakGlassOnSubmit && approvers?.autoApprovalOnly && (
            <Alert tone="warn" title="No one will review this request">
              This folder has no approvers. Your request is approved only if it passes an
              auto-approval rule when you submit it. Otherwise it&apos;s rejected immediately.
            </Alert>
          )}
          {!breakGlassOnSubmit && (
            <AutoApprovalInputFields
              inputs={inputs}
              values={inputValues}
              onChange={(key, value) => setInputValues((current) => ({ ...current, [key]: value }))}
            />
          )}
          <ApprovalWorkflow steps={steps} waiting={false} />
          {account.canBreakGlass && (
            <Switch
              layout="row"
              label="Break glass"
              description={
                isBreakGlassOnly
                  ? "Required here. The folder has no approvers and auto-approval is off for this account. Every use is audited."
                  : "Grant now, skipping the approvers. Every use is audited."
              }
              checked={breakGlassOnSubmit}
              disabledReason={isBreakGlassOnly ? "Break glass is the only way in here" : undefined}
              onCheckedChange={setBreakGlassChosen}
            />
          )}
        </Stack>
      </form>
    );

  let submitLabel = isCredential ? "Request credentials" : "Request session access";
  if (breakGlassOnSubmit) submitLabel = "Break glass";

  return (
    <>
      <Sheet open={Boolean(target)} onOpenChange={(next) => !next && guard.requestDiscard()}>
        <SheetContent size="md" pending={pending}>
          <SheetHeader>
            <Inline gap={12} align="center" wrap={false}>
              {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="md" />}
              <Stack gap={4}>
                <Inline gap={8} align="center">
                  <SheetTitle>{account?.name ?? "Account"}</SheetTitle>
                  {meta && <Badge tone="outline">{meta.name}</Badge>}
                  <AccessTypeBadge accessType={accessType} />
                </Inline>
                {account?.folderName && <SheetDescription>{account.folderName}</SheetDescription>}
              </Stack>
            </Inline>
          </SheetHeader>
          <SheetBody>
            <Stack gap={24}>
              {(account?.description || details.length > 0) && (
                <Stack gap={12}>
                  {account?.description && <Text muted>{account.description}</Text>}
                  {details.length > 0 && <DataList variant="props" items={details} />}
                </Stack>
              )}
              {body}
            </Stack>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              {isPending ? (
                pendingRequestId && (
                  <Button variant="destructive" loading={pending} onClick={runCancel}>
                    Cancel request
                  </Button>
                )
              ) : (
                <>
                  <Button variant="outline" onClick={guard.requestDiscard}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form={formId}
                    variant={breakGlassOnSubmit ? "destructive" : "primary"}
                    icon={breakGlassOnSubmit ? undefined : "arrow-up"}
                    loading={pending}
                    disabledReason={account && !approversPending ? undefined : "Loading approvers"}
                  >
                    {submitLabel}
                  </Button>
                </>
              )}
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="The request you started will be lost."
      />
    </>
  );
};

const MFA_FAILURE = {
  blocked:
    "Your browser blocked the MFA verification window. Allow popups for this site, then try again.",
  failed: "MFA verification timed out or failed. Please try again."
} as const;

const mfaSessionIdOf = (error: unknown) => {
  const data = (
    error as {
      response?: { data?: { error?: string; details?: { mfaSessionId?: string } } };
    }
  )?.response?.data;
  return data?.error === "SESSION_MFA_REQUIRED" ? data.details?.mfaSessionId : undefined;
};

const CredentialValue = ({
  label,
  value,
  secret
}: {
  label: string;
  value: string;
  secret: boolean;
}) => {
  const [revealed, toggle] = useReducer((current: boolean) => !current, false);
  return (
    <Field label={label}>
      <Input
        mono
        readOnly
        aria-label={label}
        type={secret && !revealed ? "password" : "text"}
        value={value}
        trailing={
          <Inline gap={4} wrap={false}>
            {secret && (
              <Button
                variant="ghost"
                size="icon-xs"
                iconOnly
                icon={revealed ? "eye-off" : "eye"}
                aria-label={`${revealed ? "Hide" : "Reveal"} ${label}`}
                onClick={toggle}
              />
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              iconOnly
              icon="copy"
              aria-label={`Copy ${label}`}
              onClick={() => {
                navigator.clipboard.writeText(value);
                saved(`${label} copied to clipboard`);
              }}
            />
          </Inline>
        }
      />
    </Field>
  );
};

export const CredentialsDialog = ({
  account,
  onOpenChange
}: {
  account: TPamAccountListItem | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const pam = useV4Adapter("pam");
  const pamAccess = useV4Adapter("pamAccess");
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const reveal = pamAccess.useRevealCredentials();
  const runMfa = pamAccess.useMfaChallenge();
  const [reason, setReason] = useState("");
  const [credentials, setCredentials] = useState<Record<string, unknown>>();
  const [mfaError, setMfaError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [pending, setPending] = useState(false);
  const openId = useRef(account?.id);
  useEffect(() => {
    openId.current = account?.id;
  }, [account?.id]);
  const requireReason = Boolean(account?.requireReason);
  const descriptors = new Map(
    (accountTypes.find(({ type }) => type === account?.accountType)?.credentialFields ?? []).map(
      (field) => [field.key, field]
    )
  );
  const fields = Object.entries(credentials ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
  );

  const close = () => {
    setReason("");
    setCredentials(undefined);
    setMfaError("");
    setVerifying(false);
    onOpenChange(false);
  };

  const run = async (accountId: string, mfaSessionId?: string): Promise<void> => {
    const stale = () => openId.current !== accountId;
    setMfaError("");
    try {
      const result = await reveal.mutateAsync({
        accountId,
        reason: reason.trim() || undefined,
        mfaSessionId
      });
      if (!stale()) setCredentials(result.credentials);
    } catch (error) {
      if (stale()) return;
      const challenge = mfaSessionId ? undefined : mfaSessionIdOf(error);
      if (!challenge) {
        failed("Failed to reveal credentials", error);
        return;
      }
      setVerifying(true);
      const outcome = await runMfa(challenge);
      if (stale()) return;
      setVerifying(false);
      if (outcome === "verified") await run(accountId, challenge);
      else setMfaError(MFA_FAILURE[outcome]);
    }
  };

  const submit = async () => {
    if (!account) return;
    setPending(true);
    try {
      await run(account.id);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={Boolean(account)} onOpenChange={(next) => !next && close()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Account credentials</DialogTitle>
          <DialogDescription>
            {credentials
              ? `Stored credentials for ${account?.name ?? "this account"}. Copying one takes it outside Infisical, where no session recording applies.`
              : `Every reveal of ${account?.name ?? "this account"}'s credentials is recorded in the audit log.`}
          </DialogDescription>
        </DialogHeader>
        <Stack gap={16}>
          {mfaError && (
            <Alert tone="bad" title="MFA verification incomplete">
              {mfaError}
            </Alert>
          )}
          {verifying && (
            <Alert tone="info" title="Waiting for MFA verification">
              Complete the verification in the popup window and leave this dialog open.
            </Alert>
          )}
          {credentials ? (
            <>
              {fields.length === 0 && (
                <Text muted>This account has no credential configured yet.</Text>
              )}
              {fields.map(([key, value]) => (
                <CredentialValue
                  key={key}
                  label={descriptors.get(key)?.label ?? key}
                  value={value}
                  secret={descriptors.get(key)?.secret ?? true}
                />
              ))}
            </>
          ) : (
            <form
              id="pam-reveal-credentials"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Field label="Reason" optional={!requireReason}>
                <Textarea
                  rows={3}
                  maxLength={500}
                  value={reason}
                  placeholder="Why do you need this credential?"
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </form>
          )}
        </Stack>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {credentials ? "Close" : "Cancel"}
          </Button>
          {!credentials && (
            <Button
              variant="primary"
              icon="eye"
              type="submit"
              form="pam-reveal-credentials"
              loading={pending || verifying}
              disabledReason={requireReason && !reason.trim() ? "Give a reason first" : undefined}
            >
              Reveal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
