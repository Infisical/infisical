import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Popover, PopoverContent, PopoverTrigger } from "@infisical/cipher/ui/popover";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { ApprovalStatus } from "@app/hooks/api/secretApprovalRequest/types";

import { failed, toast } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import type { ChangeRequest } from "./parts";

export const ReviewPopover = ({
  request,
  projectId,
  myReview,
  mergesOnApprove,
  disabledReason,
  emphasis
}: {
  request: ChangeRequest;
  projectId: string;
  myReview?: ChangeRequest["reviewers"][number];
  mergesOnApprove: boolean;
  disabledReason?: string;
  emphasis: boolean;
}) => {
  const secrets = useV4Adapter("secrets");
  const review = secrets.useReviewApprovalRequest();
  const merge = secrets.useMergeApprovalRequest();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [running, setRunning] = useState<"approve" | "merge" | "reject">();

  const submit = async (status: ApprovalStatus, andMerge = false) => {
    setRunning(andMerge ? "merge" : (status === ApprovalStatus.APPROVED && "approve") || "reject");
    try {
      await review.mutateAsync({ id: request.id, projectId, status, comment });
    } catch (error) {
      failed("Your review could not be saved", error);
      setRunning(undefined);
      return;
    }
    setOpen(false);
    setComment("");
    if (!andMerge) {
      setRunning(undefined);
      toast({
        tone: "ok",
        title:
          status === ApprovalStatus.APPROVED
            ? "You approved this change request"
            : "You rejected this change request"
      });
      return;
    }
    try {
      await merge.mutateAsync({
        id: request.id,
        projectId,
        environment: request.environment,
        secretPath: request.secretPath
      });
      toast({ tone: "ok", title: "Change request merged" });
    } catch (error) {
      failed("Approved, but the change request could not be merged", error);
    } finally {
      setRunning(undefined);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setComment(myReview?.comment ?? "");
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={emphasis ? "primary" : "outline"} disabledReason={disabledReason}>
          {myReview ? "Update review" : "Review changes"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" style={{ width: 384 }}>
        <Stack gap={12}>
          <strong>{myReview ? "Update your review" : "Finish your review"}</strong>
          <Field label="Comment" optional>
            <Textarea
              rows={3}
              placeholder="Leave a comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
          <Inline gap={8} justify="end">
            <Button
              variant="outline"
              loading={running === "reject"}
              disabled={Boolean(running)}
              onClick={() => submit(ApprovalStatus.REJECTED)}
            >
              Reject
            </Button>
            <Button
              variant={mergesOnApprove ? "outline" : "accent"}
              loading={running === "approve"}
              disabled={Boolean(running)}
              onClick={() => submit(ApprovalStatus.APPROVED)}
            >
              Approve
            </Button>
            {mergesOnApprove && (
              <Button
                variant="accent"
                loading={running === "merge"}
                disabled={Boolean(running)}
                onClick={() => submit(ApprovalStatus.APPROVED, true)}
              >
                Approve and merge
              </Button>
            )}
          </Inline>
        </Stack>
      </PopoverContent>
    </Popover>
  );
};
