import { Controller, useForm } from "react-hook-form";
import {
  faCheck,
  faMagnifyingGlass,
  faTriangleExclamation,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextArea
} from "@app/components/v2";
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
    bypassReason: z.string().max(500).optional()
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
    <div className="flex w-full flex-col gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
      <div className="flex items-center justify-between border-b border-yellow-500/30 pb-2">
        <h3 className="font-medium text-mineshaft-100">Action Required</h3>
        <span className="text-xs text-yellow-500">Awaiting Your Approval</span>
      </div>
      <div className="space-y-4">
        <p className="text-sm text-mineshaft-300">
          {isApprover
            ? "You are an approver for the current step. Please review the request details and provide your decision."
            : "You can bypass this policy on this request. Provide a reason and approve to grant access immediately."}
        </p>
        <Popover>
          <PopoverTrigger>
            <Button
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              className="px-2 py-1"
            >
              Review
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" title="Finish your review" className="w-96 pt-4">
            <form onSubmit={handleSubmit(onApprove)}>
              {request.canBreakGlass && (
                <div className="mb-4 flex flex-col space-y-2">
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
                          isRequired
                          isError={Boolean(error)}
                          errorText={error?.message}
                          tooltipText="Enter a reason for bypassing the policy"
                          className="mb-0"
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
              {isApprover && (
                <>
                  <FormLabel label="Finish your review" />
                  <Controller
                    control={control}
                    name="comment"
                    render={({ field }) => (
                      <TextArea
                        {...field}
                        placeholder="Add a comment about your decision..."
                        rows={3}
                        reSize="vertical"
                        className="mt-1 mb-4"
                      />
                    )}
                  />
                </>
              )}
              <div className="flex gap-3">
                <Button
                  type="submit"
                  colorSchema="primary"
                  leftIcon={<FontAwesomeIcon icon={faCheck} />}
                  isLoading={isApproving}
                  isDisabled={isRejecting || !canSubmitApprove}
                  className="px-2 py-1"
                >
                  Approve Request
                </Button>
                {isApprover && (
                  <Button
                    type="button"
                    colorSchema="danger"
                    leftIcon={<FontAwesomeIcon icon={faXmark} />}
                    onClick={handleReject}
                    isLoading={isRejecting}
                    isDisabled={isApproving}
                    className="px-2 py-1"
                  >
                    Reject Request
                  </Button>
                )}
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
