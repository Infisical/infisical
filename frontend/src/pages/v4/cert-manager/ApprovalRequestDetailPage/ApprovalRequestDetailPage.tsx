import { useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { DetailLayout, Inline, Stack } from "@app/components/v4/ui/layout";
import { type DataListItem, DataList, List, ListRow } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { StatusText } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApproverType
} from "@app/hooks/api/approvalPolicies/types";
import {
  ApprovalRequestApprovalDecision,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  type ApprovalRequestStep,
  type TApprovalRequest
} from "@app/hooks/api/approvalRequests/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref, useGo, v4Path } from "../../links";
import {
  certDataOf,
  decisionBlock,
  RequestStatus,
  signingDataOf,
  useApproverLabel
} from "../components/approval";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { CertificateSections, SigningScopeCard } from "./sections";

const routeId = v4Path("/organizations/$orgId/cert-manager/approvals/$approvalRequestId");

type Origin = {
  applicationName?: string;
  signerId?: string;
  from?: "root-requests";
};

const backOf = (orgId: string, isSigning: boolean, origin: Origin) => {
  const pki = orgHref(orgId, "/cert-manager");
  if (origin.applicationName)
    return {
      label: origin.applicationName,
      href: `${pki}/applications/${origin.applicationName}?selectedTab=requests`
    };
  if (origin.from === "root-requests")
    return {
      label: "Approval requests",
      href: isSigning ? `${pki}/requests?selectedTab=signing-requests` : `${pki}/requests`
    };
  if (origin.signerId)
    return {
      label: "Signer",
      href: `${pki}/code-signing/${origin.signerId}?selectedTab=approvals`
    };
  if (isSigning) return { label: "Signers", href: `${pki}/code-signing` };
  return { label: "Approvals", href: `${pki}/approvals` };
};

const DecisionDialog = ({
  request,
  decision,
  onClose
}: {
  request: TApprovalRequest;
  decision: ApprovalRequestApprovalDecision | null;
  onClose: () => void;
}) => {
  const approvals = useV4Adapter("approvalRequests");
  const approve = approvals.useApprove();
  const reject = approvals.useReject();
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const isApprove = decision === ApprovalRequestApprovalDecision.Approved;
  const close = () => {
    setComment("");
    onClose();
  };
  return (
    <Dialog open={decision !== null} onOpenChange={(open) => !open && !pending && close()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{isApprove ? "Approve request" : "Reject request"}</DialogTitle>
          <DialogDescription>
            {isApprove
              ? "The requester gets the access described on this request as soon as you approve."
              : "The request is closed and the requester gets no access. They can open a new one."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="approval-decision"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            const dto = {
              policyType: request.type,
              requestId: request.id,
              comment: comment.trim() || undefined
            };
            try {
              if (isApprove) await approve.mutateAsync(dto);
              else await reject.mutateAsync(dto);
              saved(isApprove ? "Request approved" : "Request rejected");
              close();
            } catch (error) {
              failed(isApprove ? "Failed to approve request" : "Failed to reject request", error);
            } finally {
              setPending(false);
            }
          }}
        >
          <Field label={isApprove ? "Comment" : "Reason for rejection"} optional>
            <Textarea
              rows={3}
              maxLength={500}
              value={comment}
              placeholder={
                isApprove
                  ? "Add a comment about your approval"
                  : "Explain why you are rejecting this request"
              }
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="approval-decision"
            variant={isApprove ? "primary" : "destructive"}
            loading={pending}
          >
            {isApprove ? "Confirm approval" : "Confirm rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const decisionView: Record<ApprovalRequestApprovalDecision, { label: string; tone: "ok" | "bad" }> =
  {
    [ApprovalRequestApprovalDecision.Approved]: { label: "Approved", tone: "ok" },
    [ApprovalRequestApprovalDecision.Rejected]: { label: "Rejected", tone: "bad" }
  };

const StepList = ({
  step,
  index,
  label
}: {
  step: ApprovalRequestStep;
  index: number;
  label: (type: ApproverType, id: string) => string;
}) => {
  const approved = step.approvals.filter(
    (approval) => approval.decision === ApprovalRequestApprovalDecision.Approved
  ).length;
  const directUsers = new Set(
    step.approvers.filter((approver) => approver.type === ApproverType.User).map(({ id }) => id)
  );
  const viaGroup = step.approvals.filter((approval) => !directUsers.has(approval.approverUserId));
  const decisionMeta = (decision?: ApprovalRequestApprovalDecision) =>
    decision ? (
      <StatusText
        tone={decisionView[decision].tone}
        icon={decision === ApprovalRequestApprovalDecision.Approved ? "check-c" : "x"}
      >
        {decisionView[decision].label}
      </StatusText>
    ) : undefined;
  return (
    <List
      label={`Step ${index + 1}`}
      size="sm"
      title={
        <Inline gap={8} align="center">
          {step.name ? `Step ${index + 1}: ${step.name}` : `Step ${index + 1}`}
          {step.status === ApprovalRequestStepStatus.InProgress && (
            <Badge tone="info">Current</Badge>
          )}
        </Inline>
      }
      count={`${approved} of ${step.requiredApprovals} approval${step.requiredApprovals === 1 ? "" : "s"}`}
    >
      {step.approvers.map((approver) => {
        const approval =
          approver.type === ApproverType.User
            ? step.approvals.find((entry) => entry.approverUserId === approver.id)
            : undefined;
        return (
          <ListRow
            key={`${approver.type}-${approver.id}`}
            value={`${approver.type}-${approver.id}`}
            label={label(approver.type, approver.id)}
            media={<Icon name={approver.type === ApproverType.Group ? "apps" : "user"} />}
            title={label(approver.type, approver.id)}
            description={approval?.comment ?? undefined}
            meta={decisionMeta(approval?.decision)}
          />
        );
      })}
      {viaGroup.map((approval) => (
        <ListRow
          key={approval.id}
          value={approval.id}
          label={label(ApproverType.User, approval.approverUserId)}
          media={<Icon name="user" />}
          title={label(ApproverType.User, approval.approverUserId)}
          description={approval.comment ?? "Responded as a group member"}
          meta={decisionMeta(approval.decision)}
        />
      ))}
    </List>
  );
};

const RequestDetail = ({
  orgId,
  projectId,
  request,
  origin
}: {
  orgId: string;
  projectId: string;
  request: TApprovalRequest;
  origin: Origin;
}) => {
  const approvals = useV4Adapter("approvalRequests");
  const { user } = useV4Session();
  const go = useGo();
  const { data: viewer } = approvals.useViewer(projectId);
  const applicationId =
    request.scopeType === ApprovalPolicyScope.PkiApplication ? (request.scopeId ?? "") : "";
  const { data: application } = approvals.useApplication(applicationId);
  const cancel = approvals.useCancel();
  const label = useApproverLabel(projectId, true);
  const [decision, setDecision] = useState<ApprovalRequestApprovalDecision | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const isSigning = request.type === ApprovalPolicyType.CertCodeSigning;
  const back = backOf(orgId, isSigning, origin);
  const certData = certDataOf(request);
  const signingData = signingDataOf(request);
  const requester = request.requesterName || "Unknown";
  const isPending = request.status === ApprovalRequestStatus.Pending;
  const block = decisionBlock(request, { userId: user.id, groupIds: viewer?.groupIds ?? [] });
  const cancelBlock =
    request.requesterId === user.id ? undefined : "Only the requester can cancel this request";
  const subject = certData?.certificateRequest?.commonName || certData?.profileName;
  const lede = isSigning ? (
    <>
      Signing request for signer {signingData?.signerName} by {requester}.
    </>
  ) : (
    <>
      Certificate issuance request for {subject} by {requester}
      {application ? (
        <>
          {" on application "}
          <Button variant="link" asChild>
            <a href={orgHref(orgId, `/cert-manager/applications/${application.name}`)}>
              {application.name}
            </a>
          </Button>
        </>
      ) : null}
      .
    </>
  );
  const facts: DataListItem[] = [
    ["Requester", requester, { span: "half" }],
    ["Email", request.requesterEmail || "None", { span: "half" }],
    ["Status", <RequestStatus key="status" status={request.status} />, { span: "half" }],
    ["Requested", format(new Date(request.createdAt), "yyyy-MM-dd, hh:mm aaa"), { span: "half" }],
    ...(isSigning
      ? ([
          ["Signer", signingData?.signerName],
          ...(signingData?.requestedWindowDuration
            ? [["Access duration", `${signingData.requestedWindowDuration} from approval`]]
            : []),
          ...(signingData?.requestedSignings
            ? [["Allowed sign operations", String(signingData.requestedSignings)]]
            : [])
        ] as DataListItem[])
      : ([
          ["Profile", certData?.profileName],
          ...(application ? [["Application", application.name]] : [])
        ] as DataListItem[])),
    ...(request.justification
      ? ([["Justification", request.justification]] as DataListItem[])
      : []),
    ...(request.expiresAt
      ? ([
          ["Expires", format(new Date(request.expiresAt), "yyyy-MM-dd, hh:mm aaa")]
        ] as DataListItem[])
      : [])
  ];
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[back]}
          title={isSigning ? "Signing request" : "Certificate approval request"}
          badges={<RequestStatus status={request.status} />}
          description={lede}
          actions={
            isPending ? (
              <>
                <Button
                  variant="outline"
                  disabledReason={cancelBlock}
                  onClick={() => setCancelling(true)}
                >
                  Cancel request
                </Button>
                <Button
                  variant="outline"
                  icon="x"
                  disabledReason={block}
                  onClick={() => setDecision(ApprovalRequestApprovalDecision.Rejected)}
                >
                  Reject
                </Button>
                <Button
                  variant="accent"
                  icon="check"
                  disabledReason={block}
                  onClick={() => setDecision(ApprovalRequestApprovalDecision.Approved)}
                >
                  Approve
                </Button>
              </>
            ) : undefined
          }
        />
        <DetailLayout
          asideLabel="Request details"
          aside={
            <Card variant="framed" title="Request">
              <DataList variant="props" density="compact" items={facts} />
            </Card>
          }
        >
          {request.steps.length === 0 && request.status === ApprovalRequestStatus.Approved ? (
            <List
              label="Approval workflow"
              title="Approval workflow"
              size="sm"
              empty={
                <EmptyState
                  size="sm"
                  media="bare"
                  icon="check-c"
                  title="Pre-approved"
                  description="An administrator pre-approved this request."
                />
              }
            />
          ) : (
            request.steps.map((step, index) => (
              <StepList key={step.id} step={step} index={index} label={label} />
            ))
          )}
          {isSigning ? (
            <SigningScopeCard request={request} />
          ) : (
            <CertificateSections orgId={orgId} request={request} />
          )}
        </DetailLayout>
      </Stack>
      <DecisionDialog request={request} decision={decision} onClose={() => setDecision(null)} />
      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this approval request?</AlertDialogTitle>
            <AlertDialogDescription>
              Approvers can no longer act on it. You cannot undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep request</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await cancel.mutateAsync({ policyType: request.type, requestId: request.id });
                } catch (error) {
                  failed("Failed to cancel request", error);
                  return;
                }
                saved("Request cancelled");
                go(back.href);
              }}
            >
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export const ApprovalRequestDetailPage = () => {
  const { orgId, approvalRequestId } = useParams({ from: routeId });
  const { policyType, applicationName, signerId, from } = useSearch({ from: routeId });
  const { projectId, isPending: isResolving } = useCertManagerProjectId(orgId);
  const { data: request, isPending } = useV4Adapter("approvalRequests").useRequest({
    policyType: policyType ?? ApprovalPolicyType.CertRequest,
    requestId: approvalRequestId
  });
  if (isResolving || isPending) return <Loader size="page" label="Loading approval request" />;
  if (!projectId) return <CertManagerNotSetUp orgId={orgId} />;
  if (!request)
    return (
      <EmptyState
        icon="alert"
        title="Approval request not found"
        description="It may have been removed, or you may not have access to it."
        actions={
          <Button variant="outline" asChild>
            <a href={orgHref(orgId, "/cert-manager/requests")}>Back to approval requests</a>
          </Button>
        }
      />
    );
  return (
    <RequestDetail
      orgId={orgId}
      projectId={projectId}
      request={request}
      origin={{ applicationName, signerId, from }}
    />
  );
};
