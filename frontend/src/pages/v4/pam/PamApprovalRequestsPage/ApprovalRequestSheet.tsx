import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@infisical/cipher/ui/detail";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { type DataListItem, DataList } from "@infisical/cipher/ui/list";
import {
  Sheet,
  SheetAside,
  SheetBody,
  SheetContent,
  SheetFooter
} from "@infisical/cipher/ui/sheet";
import { SmallText, StatusText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";

import type { TAutoApprovalOutcome } from "@app/hooks/api/approvalPolicies";
import {
  PamAccessRequestDecision,
  PamAccessRequestStatus,
  PamAccessType,
  type TPamAccessRequest
} from "@app/hooks/api/pam";

import { failed, toast } from "../../access/toast";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import {
  formatDuration,
  formatRequestDate,
  isGrantActive,
  isMachineIdentityRequest,
  requestStatus
} from "./status";

type Rule = TAutoApprovalOutcome["rules"][number];

const LinkedValue = ({ input }: { input: TAutoApprovalOutcome["inputs"][number] }) =>
  input.url ? (
    <Button variant="link" asChild>
      <a href={input.url} target="_blank" rel="noopener noreferrer">
        {input.value}
      </a>
    </Button>
  ) : (
    input.value
  );

const ruleSummary = (rule: Rule) => {
  const failures = rule.conditions.filter((condition) => !condition.passed).length;
  const total = rule.conditions.length;
  if (!failures) return `All ${total} ${total === 1 ? "check" : "checks"} passed`;
  return `${failures} of ${total} ${total === 1 ? "check" : "checks"} failed`;
};

const AutoApprovalResults = ({ outcome }: { outcome: TAutoApprovalOutcome }) => {
  const approvingRule = outcome.rules.find((rule) => rule.id === outcome.approvedByRuleId);
  const approved = Boolean(outcome.approvedAt && approvingRule);
  const rules = approved && approvingRule ? [approvingRule] : outcome.rules;
  return (
    <DetailGroup>
      <DetailGroupHeader>Auto-approval</DetailGroupHeader>
      <StatusText tone={approved ? "ok" : "neutral"} icon={approved ? "check-c" : "minus"}>
        {approved ? "Approved by a rule" : "No rule passed"}
      </StatusText>
      <Accordion type="multiple">
        {rules.map((rule) => {
          const passed = rule.conditions.every((condition) => condition.passed);
          return (
            <AccordionItem key={rule.id} value={rule.id}>
              <AccordionTrigger>
                <Stack gap={2}>
                  <StatusText tone={passed ? "ok" : "bad"} icon={passed ? "check" : "x"}>
                    {rule.name}
                  </StatusText>
                  <SmallText muted>{ruleSummary(rule)}</SmallText>
                </Stack>
              </AccordionTrigger>
              <AccordionContent>
                <Stack gap={8}>
                  {rule.conditions.map((condition) => (
                    <Stack key={condition.id} gap={2}>
                      <StatusText
                        tone={condition.passed ? "ok" : "bad"}
                        icon={condition.passed ? "check" : "x"}
                      >
                        {condition.description}
                      </StatusText>
                      {!condition.passed && condition.reason && (
                        <SmallText muted>{condition.reason}</SmallText>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </DetailGroup>
  );
};

const RequestBody = ({
  request,
  onClose,
  canRevokeGrants
}: {
  request: TPamAccessRequest;
  onClose: () => void;
  canRevokeGrants: boolean;
}) => {
  const pam = useV4Adapter("pam");
  const { user } = useV4Session();
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const review = pam.useReviewAccessRequest();
  const revoke = pam.useRevokeAccessRequest();
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<PamAccessRequestDecision>();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const status = requestStatus(request);
  const requestData = request.requestData?.requestData;
  const isPending = request.status === PamAccessRequestStatus.Pending;
  const isOwnRequest = Boolean(request.requesterId && request.requesterId === user.id);
  const canRevoke = canRevokeGrants && isGrantActive(request);
  const isCredential = request.accessType === PamAccessType.Credential;
  const meta = accountTypes.find(({ type }) => type === request.accountType);
  const facts: DataListItem[] = [
    isMachineIdentityRequest(request)
      ? ["Actor", "Machine identity"]
      : ["Email", request.requesterEmail],
    ["Folder", request.folderName ?? "None"],
    ["Grants", isCredential ? "Credential access" : "Session access"],
    ...(request.host ? [["Host", <code key="host">{request.host}</code>] as DataListItem] : []),
    ["Requested at", formatRequestDate(request.createdAt)],
    ...(request.grantExpiresAt
      ? [["Expires", formatRequestDate(request.grantExpiresAt)] as DataListItem]
      : [])
  ];

  const handleReview = async (next: PamAccessRequestDecision) => {
    setDecision(next);
    try {
      await review.mutateAsync({
        requestId: request.id,
        status: next,
        comment: comment.trim() || undefined
      });
      toast({
        tone: "ok",
        title: next === PamAccessRequestDecision.Approved ? "Request approved" : "Request denied"
      });
      onClose();
    } catch (error) {
      failed(
        next === PamAccessRequestDecision.Approved
          ? "Failed to approve the request"
          : "Failed to deny the request",
        error
      );
    } finally {
      setDecision(undefined);
    }
  };

  const handleRevoke = async () => {
    if (!request.grantId) return;
    setRevoking(true);
    try {
      await revoke.mutateAsync({ grantId: request.grantId });
      toast({ tone: "ok", title: "Access revoked" });
      setConfirmRevoke(false);
      onClose();
    } catch (error) {
      failed("Failed to revoke access", error);
    } finally {
      setRevoking(false);
    }
  };

  return (
    <SheetContent size="xl" pending={Boolean(decision) || revoking}>
      <SheetAside
        mainLabel="Request"
        media={meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="md" />}
        title={request.accountName ?? "Access request"}
        description={`Request from ${request.requesterName}`}
        badges={
          <StatusText tone={status.tone} icon={status.icon}>
            {status.label}
          </StatusText>
        }
      >
        <DataList variant="props" items={facts} />
      </SheetAside>
      <SheetBody>
        <Stack gap={24}>
          {request.isBreakGlass && (
            <Alert tone="bad" title="Approval bypassed with break-glass">
              <Stack gap={4}>
                <span>
                  {`${request.requesterName} granted themselves this access without waiting for an approver.`}
                </span>
                {request.bypassReason && <span>{`Reason: ${request.bypassReason}`}</span>}
              </Stack>
            </Alert>
          )}
          {isCredential && (
            <Alert tone="warn" title="Approving reveals the stored credential">
              The requester can read this account&apos;s password or key directly for the requested
              duration, outside a recorded session.
            </Alert>
          )}
          <DetailGroup>
            <Detail>
              <DetailLabel>Access duration</DetailLabel>
              <DetailValue>{formatDuration(requestData?.duration)}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Reason</DetailLabel>
              <DetailValue>{requestData?.reason || "No reason provided"}</DetailValue>
            </Detail>
            {(request.autoApproval?.inputs ?? []).map((input) => (
              <Detail key={`${input.label}:${input.value}`}>
                <DetailLabel>{input.label}</DetailLabel>
                <DetailValue>
                  <LinkedValue input={input} />
                </DetailValue>
              </Detail>
            ))}
          </DetailGroup>
          {request.autoApproval && <AutoApprovalResults outcome={request.autoApproval} />}
          {isPending && (
            <Field
              label="Approval comment"
              optional
              description="Visible to the requester and recorded in audit logs."
            >
              <Textarea
                rows={4}
                value={comment}
                disabled={Boolean(decision)}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Context for the requester"
              />
            </Field>
          )}
        </Stack>
      </SheetBody>
      {(isPending || canRevoke) && (
        <SheetFooter>
          {isPending && (
            <>
              <Button
                variant="accent"
                icon="check"
                loading={decision === PamAccessRequestDecision.Approved}
                disabled={Boolean(decision)}
                disabledReason={isOwnRequest ? "You cannot approve your own request" : undefined}
                onClick={() => handleReview(PamAccessRequestDecision.Approved)}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                icon="x"
                loading={decision === PamAccessRequestDecision.Rejected}
                disabled={Boolean(decision)}
                onClick={() => handleReview(PamAccessRequestDecision.Rejected)}
              >
                Deny
              </Button>
            </>
          )}
          {canRevoke && (
            <Button variant="destructive" onClick={() => setConfirmRevoke(true)}>
              Revoke access
            </Button>
          )}
        </SheetFooter>
      )}
      <AlertDialog open={confirmRevoke} onOpenChange={(open) => !open && setConfirmRevoke(false)}>
        <AlertDialogContent tone="danger" icon="lock" confirmText="revoke">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Revoke ${request.requesterName}'s access?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`They lose access to ${request.accountName ?? "this account"} right away.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={revoking} onClick={handleRevoke}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  );
};

export const ApprovalRequestSheet = ({
  request,
  onOpenChange,
  canRevokeGrants = true
}: {
  request: TPamAccessRequest | undefined;
  onOpenChange: (open: boolean) => void;
  canRevokeGrants?: boolean;
}) => {
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  return (
    <Sheet open={Boolean(request)} onOpenChange={onOpenChange}>
      {shown && (
        <RequestBody
          key={shown.id}
          request={shown}
          canRevokeGrants={canRevokeGrants}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Sheet>
  );
};
