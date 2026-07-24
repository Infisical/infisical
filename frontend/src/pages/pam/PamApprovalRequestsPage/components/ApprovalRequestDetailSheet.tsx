import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Clock, ShieldCheck, X } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useUser } from "@app/context";
import {
  PamAccessRequestDecision,
  PamAccessRequestStatus,
  useReviewPamAccessRequest,
  useRevokePamAccessRequest
} from "@app/hooks/api/pam";
import { TPamAccessRequest } from "@app/hooks/api/pam/types";

import { AccountPlatformIcon } from "../../components/AccountPlatformIcon";
import { getRequestStatusInfo, isGrantActive } from "../../components/approvalRequestStatus";
import { formatDuration } from "../../components/formatDuration";
import { PamDetailSheet } from "../../components/PamDetailSheet";

type Props = {
  request: TPamAccessRequest | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ApprovalRequestDetailSheet = ({ request, isOpen, onOpenChange }: Props) => {
  const { user } = useUser();
  const reviewMutation = useReviewPamAccessRequest();
  const revokeMutation = useRevokePamAccessRequest();
  const [comment, setComment] = useState("");
  const [isRevokeConfirmOpen, setIsRevokeConfirmOpen] = useState(false);

  useEffect(() => {
    setComment("");
  }, [request?.id]);

  const status = getRequestStatusInfo(
    request ?? { status: PamAccessRequestStatus.Pending, grantExpiresAt: null }
  );
  const requestData = request?.requestData?.requestData;
  const isPending = request?.status === PamAccessRequestStatus.Pending;
  // Self-approval is always blocked server-side; denying your own request stays allowed
  const isOwnRequest = Boolean(request?.requesterId && request.requesterId === user?.id);
  const canRevoke = isGrantActive(request);

  const handleReview = (decision: PamAccessRequestDecision) => {
    if (!request) return;
    reviewMutation.mutate(
      {
        requestId: request.id,
        status: decision,
        comment: comment.trim() || undefined
      },
      {
        onSuccess: () => {
          createNotification({
            text:
              decision === PamAccessRequestDecision.Approved
                ? "Request approved"
                : "Request denied",
            type: "success"
          });
          onOpenChange(false);
        }
      }
    );
  };

  const handleRevoke = async () => {
    if (!request) return;
    await revokeMutation.mutateAsync({ requestId: request.id });
    createNotification({ text: "Access revoked", type: "success" });
    setIsRevokeConfirmOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <DeleteActionModal
        isOpen={isRevokeConfirmOpen}
        onChange={setIsRevokeConfirmOpen}
        title="Revoke Access"
        subTitle="Are you sure you want to revoke this user's approved access? Any active session using it will be terminated immediately."
        deleteKey="revoke"
        buttonText="Revoke"
        onDeleteApproved={handleRevoke}
      />
      <PamDetailSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isLoading={!request}
        icon={
          request?.accountType ? (
            <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
              <AccountPlatformIcon accountType={request.accountType} size={40} />
            </div>
          ) : (
            <div className="mb-4 flex size-16 items-center justify-center rounded-lg border border-border bg-container">
              <ShieldCheck className="size-9 text-product-pam" />
            </div>
          )
        }
        title={request?.accountName ?? "Access Request"}
        subtitle={request ? `Request from ${request.requesterName}` : undefined}
        typeBadge={status.label}
        metadata={[
          { label: "Requester", value: request?.requesterName ?? "-" },
          { label: "Email", value: request?.requesterEmail ?? "-" },
          { label: "Folder", value: request?.folderName ?? "-" },
          ...(request?.host ? [{ label: "Host", value: request.host }] : []),
          {
            label: "Requested At",
            value: request ? format(new Date(request.createdAt), "MMM d, yyyy h:mm a") : "-"
          },
          ...(request?.grantExpiresAt
            ? [
                {
                  label: "Expires",
                  value: format(new Date(request.grantExpiresAt), "MMM d, yyyy h:mm a")
                }
              ]
            : []),
          { label: "Reason", value: requestData?.reason || "No reason provided" }
        ]}
      >
        <Tabs defaultValue="review" className="flex h-full flex-col">
          <TabsList variant="pam" className="shrink-0 bg-popover">
            <TabsTrigger value="review">
              <Check className="size-4" />
              Review
            </TabsTrigger>
          </TabsList>
          <TabsContent value="review" className="m-0 flex flex-1 flex-col p-6">
            <div className="flex flex-1 flex-col gap-6">
              {isPending && (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">Approval comment</p>
                  <TextArea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    placeholder="Optional context for the requester"
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    Visible to the requester and recorded in audit logs
                  </p>
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Access duration</p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-container px-3 py-2.5 text-sm text-foreground">
                  <Clock className="size-4 text-muted" />
                  {formatDuration(requestData?.duration)}
                </div>
              </div>

              {!isPending && !canRevoke && (
                <p className="text-sm text-muted">
                  This request has been {status.label.toLowerCase()} and can no longer be actioned.
                </p>
              )}
            </div>

            {(isPending || canRevoke) && (
              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                {isPending && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleReview(PamAccessRequestDecision.Rejected)}
                      isPending={reviewMutation.isPending}
                    >
                      <X className="mr-1.5 size-4" />
                      Deny
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Button
                            variant="pam"
                            onClick={() => handleReview(PamAccessRequestDecision.Approved)}
                            isPending={reviewMutation.isPending}
                            isDisabled={isOwnRequest}
                          >
                            <Check className="mr-1.5 size-4" />
                            Approve
                          </Button>
                        </div>
                      </TooltipTrigger>
                      {isOwnRequest && (
                        <TooltipContent>You cannot approve your own request</TooltipContent>
                      )}
                    </Tooltip>
                  </>
                )}
                {canRevoke && (
                  <Button variant="danger" onClick={() => setIsRevokeConfirmOpen(true)}>
                    Revoke Access
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </PamDetailSheet>
    </>
  );
};
