import { Controller, useForm } from "react-hook-form";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, FormControl, Input, TextArea } from "@app/components/v2";
import { useProjectPermission, useUser } from "@app/context";
import { ApproverType } from "@app/hooks/api/approvalPolicies";
import {
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  TApprovalRequest,
  useApproveApprovalRequest,
  useRejectApprovalRequest
} from "@app/hooks/api/approvalRequests";

type Props = {
  request: TApprovalRequest;
};

const ReviewFormSchema = z
  .object({
    comment: z.string().max(1000).optional(),
    bypassApproval: z.boolean().default(false),
    bypassReason: z.string().max(1000).optional()
  })
  .superRefine((data, ctx) => {
    if (data.bypassApproval && (data.bypassReason ?? "").trim().length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bypassReason"],
        message: "Minimum 10 characters required"
      });
    }
  });

type TReviewForm = z.infer<typeof ReviewFormSchema>;

export const RequestActionsSection = ({ request }: Props) => {
  const { user } = useUser();
  const { memberships } = useProjectPermission();

  const userId = user?.id || "";
  const userGroups = memberships.map((el) => el.actorGroupId).filter(Boolean);

  const { mutateAsync: approveRequest, isPending: isApproving } = useApproveApprovalRequest();
  const { mutateAsync: rejectRequest, isPending: isRejecting } = useRejectApprovalRequest();

  const {
    control,
    handleSubmit,
    watch,
    reset,
    getValues,
    formState: { isValid }
  } = useForm<TReviewForm>({
    resolver: zodResolver(ReviewFormSchema),
    mode: "onChange",
    defaultValues: { comment: "", bypassApproval: false, bypassReason: "" }
  });

  const bypassApproval = watch("bypassApproval");

  if (request.status !== ApprovalRequestStatus.Pending) {
    return null;
  }

  const currentStep = request.steps.find(
    (step) => step.status === ApprovalRequestStepStatus.InProgress
  );

  const isApprover = currentStep
    ? currentStep.approvers.some((approver) =>
        approver.type === ApproverType.User
          ? approver.id === userId
          : userGroups.includes(approver.id)
      )
    : false;

  const hasAlreadyActed = currentStep
    ? currentStep.approvals.some((approval) => approval.approverUserId === userId)
    : false;

  if (!isApprover && !request.canBreakGlass) {
    return null;
  }

  if (hasAlreadyActed) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <p className="text-sm text-mineshaft-300">
          You have already provided your approval for this request.
        </p>
      </div>
    );
  }

  const canSubmitApprove = bypassApproval ? isValid : isApprover;

  const onApprove = async (data: TReviewForm) => {
    try {
      await approveRequest({
        policyType: request.type,
        requestId: request.id,
        comment: !data.bypassApproval && data.comment ? data.comment : undefined,
        bypassReason: data.bypassApproval ? data.bypassReason!.trim() : undefined
      });
      createNotification({
        text: data.bypassApproval
          ? "Approved without obtaining the required approval"
          : "Request approved successfully",
        type: data.bypassApproval ? "info" : "success"
      });
    } finally {
      reset({ comment: "", bypassApproval: false, bypassReason: "" });
    }
  };

  const handleReject = async () => {
    const { comment } = getValues();
    try {
      await rejectRequest({
        policyType: request.type,
        requestId: request.id,
        comment: comment || undefined
      });
      createNotification({
        text: "Request rejected successfully",
        type: "success"
      });
    } finally {
      reset({ comment: "", bypassApproval: false, bypassReason: "" });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onApprove)}
      className="flex w-full flex-col gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3"
    >
      <div className="flex items-center justify-between border-b border-yellow-500/30 pb-2">
        <h3 className="font-medium text-mineshaft-100">Action Required</h3>
        <span className="text-xs text-yellow-500">Awaiting Your Approval</span>
      </div>

      {isApprover && (
        <Controller
          control={control}
          name="comment"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Comment (optional)"
              className="mb-0"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <TextArea
                {...field}
                placeholder="Add a comment about your decision..."
                rows={3}
                reSize="vertical"
              />
            </FormControl>
          )}
        />
      )}

      {request.canBreakGlass && (
        <div className="flex flex-col space-y-2">
          <Controller
            control={control}
            name="bypassApproval"
            render={({ field: { value, onChange } }) => (
              <Checkbox
                id="byPassApproval"
                isChecked={value}
                onCheckedChange={(checked) => onChange(checked === true)}
                className={twMerge(
                  "mt-0.5 mr-2 self-start",
                  value ? "border-red/50! bg-red/30!" : ""
                )}
                allowMultilineLabel
              >
                <span className="text-xs text-red">
                  Approve immediately without approver review (bypass policy)
                </span>
              </Checkbox>
            )}
          />
          {bypassApproval && (
            <Controller
              control={control}
              name="bypassReason"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Reason for bypass"
                  className="mt-2 mb-0"
                  isRequired
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText="Enter a reason for bypassing the policy"
                >
                  <Input
                    {...field}
                    placeholder="Enter reason for bypass"
                    leftIcon={<FontAwesomeIcon icon={faTriangleExclamation} />}
                  />
                </FormControl>
              )}
            />
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          isLoading={isApproving}
          isDisabled={isRejecting || !canSubmitApprove}
          size="sm"
          variant="outline_bg"
          colorSchema="primary"
        >
          Approve Request
        </Button>
        {isApprover && (
          <Button
            type="button"
            isLoading={isRejecting}
            isDisabled={isApproving}
            onClick={handleReject}
            size="sm"
            colorSchema="danger"
            variant="plain"
            className="text-mineshaft-200 hover:border-red hover:bg-red/20"
          >
            Reject Request
          </Button>
        )}
      </div>
    </form>
  );
};
