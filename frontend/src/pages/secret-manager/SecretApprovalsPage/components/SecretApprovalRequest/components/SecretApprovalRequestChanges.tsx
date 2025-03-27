import { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faAngleDown,
  faArrowLeft,
  faCheckCircle,
  faCircle,
  faCodeBranch,
  faComment,
  faFolder,
  faXmarkCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { RadioGroup, RadioGroupIndicator, RadioGroupItem } from "@radix-ui/react-radio-group";
import { twMerge } from "tailwind-merge";
import z from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ContentLoader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  FormControl,
  IconButton,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useGetSecretApprovalRequestDetails,
  useUpdateSecretApprovalReviewStatus
} from "@app/hooks/api";
import { ApprovalStatus, CommitType } from "@app/hooks/api/types";
import { formatReservedPaths } from "@app/lib/fn/string";

import { SecretApprovalRequestAction } from "./SecretApprovalRequestAction";
import { SecretApprovalRequestChangeItem } from "./SecretApprovalRequestChangeItem";

export const generateCommitText = (commits: { op: CommitType }[] = []) => {
  const score: Record<string, number> = {};
  commits.forEach(({ op }) => {
    score[op] = (score?.[op] || 0) + 1;
  });
  const text: ReactNode[] = [];
  if (score[CommitType.CREATE])
    text.push(
      <span key="created-commit">
        {score[CommitType.CREATE]} secret{score[CommitType.CREATE] !== 1 && "s"}
        <span style={{ color: "#16a34a" }}> created</span>
      </span>
    );
  if (score[CommitType.UPDATE])
    text.push(
      <span key="updated-commit">
        {Boolean(text.length) && ","}
        {score[CommitType.UPDATE]} secret{score[CommitType.UPDATE] !== 1 && "s"}
        <span style={{ color: "#ea580c" }} className="text-orange-600">
          {" "}
          updated
        </span>
      </span>
    );
  if (score[CommitType.DELETE])
    text.push(
      <span className="deleted-commit">
        {Boolean(text.length) && "and"}
        {score[CommitType.DELETE]} secret{score[CommitType.UPDATE] !== 1 && "s"}
        <span style={{ color: "#b91c1c" }}> deleted</span>
      </span>
    );

  return text;
};

const getReviewedStatusSymbol = (status?: ApprovalStatus) => {
  if (status === ApprovalStatus.APPROVED)
    return <FontAwesomeIcon icon={faCheckCircle} size="xs" style={{ color: "#15803d" }} />;
  if (status === ApprovalStatus.REJECTED)
    return <FontAwesomeIcon icon={faXmarkCircle} size="xs" style={{ color: "#b91c1c" }} />;
  return <FontAwesomeIcon icon={faCircle} size="xs" style={{ color: "#c2410c" }} />;
};

type Props = {
  workspaceId: string;
  approvalRequestId: string;
  onGoBack: () => void;
};

const reviewFormSchema = z.object({
  comment: z.string().trim().optional().default(""),
  status: z.nativeEnum(ApprovalStatus)
});

type TReviewFormSchema = z.infer<typeof reviewFormSchema>;

export const SecretApprovalRequestChanges = ({
  approvalRequestId,
  onGoBack,
  workspaceId
}: Props) => {
  const { user: userSession } = useUser();
  const {
    data: secretApprovalRequestDetails,
    isSuccess: isSecretApprovalRequestSuccess,
    isPending: isSecretApprovalRequestLoading
  } = useGetSecretApprovalRequestDetails({
    id: approvalRequestId
  });

  const {
    mutateAsync: updateSecretApprovalRequestStatus,
    isPending: isUpdatingRequestStatus,
    variables
  } = useUpdateSecretApprovalReviewStatus();

  const { popUp, handlePopUpToggle } = usePopUp(["reviewChanges"] as const);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TReviewFormSchema>({
    resolver: zodResolver(reviewFormSchema)
  });
  const shouldBlockSelfReview =
    secretApprovalRequestDetails?.policy?.allowedSelfApprovals === false &&
    secretApprovalRequestDetails?.committerUserId === userSession.id;
  const isApproving = variables?.status === ApprovalStatus.APPROVED && isUpdatingRequestStatus;
  const isRejecting = variables?.status === ApprovalStatus.REJECTED && isUpdatingRequestStatus;

  // membership of present user
  const canApprove = secretApprovalRequestDetails?.policy?.approvers?.some(
    ({ userId }) => userId === userSession.id
  );

  const reviewedUsers = secretApprovalRequestDetails?.reviewers?.reduce<
    Record<string, { status: ApprovalStatus; comment: string }>
  >(
    (prev, curr) => ({
      ...prev,
      [curr.userId]: { status: curr.status, comment: curr.comment }
    }),
    {}
  );

  const handleSecretApprovalStatusUpdate = async (status: ApprovalStatus, comment: string) => {
    try {
      await updateSecretApprovalRequestStatus({
        id: approvalRequestId,
        status,
        comment
      });
      createNotification({
        type: "success",
        text: `Successfully ${status} the request`
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to update the request status"
      });
    }

    handlePopUpToggle("reviewChanges", false);
    reset({
      comment: "",
      status: ApprovalStatus.APPROVED
    });
  };

  const handleSubmitReview = (data: TReviewFormSchema) => {
    handleSecretApprovalStatusUpdate(data.status, data.comment);
  };

  if (isSecretApprovalRequestLoading) {
    return (
      <div>
        <ContentLoader />
      </div>
    );
  }

  if (!isSecretApprovalRequestSuccess)
    return (
      <div>
        <EmptyState title="Failed to load approvals" />
      </div>
    );

  const isMergable =
    secretApprovalRequestDetails?.policy?.approvals <=
    secretApprovalRequestDetails?.policy?.approvers?.filter(
      ({ userId }) => reviewedUsers?.[userId]?.status === ApprovalStatus.APPROVED
    ).length;
  const hasMerged = secretApprovalRequestDetails?.hasMerged;

  return (
    <div className="flex space-x-6">
      <div className="flex-grow">
        <div className="sticky top-0 z-20 flex items-center space-x-4 bg-bunker-800 pb-6 pt-2">
          <IconButton variant="outline_bg" ariaLabel="go-back" onClick={onGoBack}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </IconButton>
          <div
            className={twMerge(
              "flex items-center space-x-2 rounded-3xl px-4 py-2 text-white",
              secretApprovalRequestDetails.status === "close" ? "bg-red-600" : "bg-green-600"
            )}
          >
            <FontAwesomeIcon icon={faCodeBranch} size="sm" />
            <span className="capitalize">
              {secretApprovalRequestDetails.status === "close"
                ? "closed"
                : secretApprovalRequestDetails.status}
            </span>
          </div>
          <div className="flex flex-grow flex-col">
            <div className="mb-1 text-lg">
              {generateCommitText(secretApprovalRequestDetails.commits)}
              {secretApprovalRequestDetails.isReplicated && (
                <span className="text-sm text-bunker-300"> (replication)</span>
              )}
            </div>
            <div className="flex items-center text-sm text-bunker-300">
              {secretApprovalRequestDetails?.committerUser?.firstName || ""}
              {secretApprovalRequestDetails?.committerUser?.lastName || ""} (
              {secretApprovalRequestDetails?.committerUser?.email}) wants to change{" "}
              {secretApprovalRequestDetails.commits.length} secret values in
              <span className="mx-1 rounded bg-primary-600/60 px-1 text-primary-300">
                {secretApprovalRequestDetails.environment}
              </span>
              <div className="flex w-min items-center rounded border border-mineshaft-500 pl-1 pr-2">
                <div className="border-r border-mineshaft-500 pr-1">
                  <FontAwesomeIcon icon={faFolder} className="text-primary" size="sm" />
                </div>
                <Tooltip content={formatReservedPaths(secretApprovalRequestDetails.secretPath)}>
                  <div className="truncate pb-0.5 pl-2 text-sm" style={{ maxWidth: "10rem" }}>
                    {formatReservedPaths(secretApprovalRequestDetails.secretPath)}
                  </div>
                </Tooltip>
              </div>
            </div>
          </div>
          {!hasMerged &&
            secretApprovalRequestDetails.status === "open" &&
            !shouldBlockSelfReview && (
              <DropdownMenu
                open={popUp.reviewChanges.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("reviewChanges", isOpen)}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline_bg"
                    rightIcon={<FontAwesomeIcon className="ml-2" icon={faAngleDown} />}
                  >
                    Review
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" asChild className="mt-3">
                  <form onSubmit={handleSubmit(handleSubmitReview)}>
                    <div className="flex w-[400px] flex-col space-y-2 p-5">
                      <div className="text-lg font-medium">Finish your review</div>
                      <Controller
                        control={control}
                        name="comment"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl errorText={error?.message} isError={Boolean(error)}>
                            <TextArea
                              {...field}
                              placeholder="Leave a comment..."
                              reSize="none"
                              className="text-md mt-2 h-48 border border-mineshaft-600 bg-bunker-800"
                            />
                          </FormControl>
                        )}
                      />
                      <Controller
                        control={control}
                        name="status"
                        defaultValue={ApprovalStatus.APPROVED}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl errorText={error?.message} isError={Boolean(error)}>
                            <RadioGroup
                              value={field.value}
                              onValueChange={field.onChange}
                              className="mb-4 space-y-2"
                              aria-label="Status"
                            >
                              <div className="flex items-center gap-2">
                                <RadioGroupItem
                                  id="approve"
                                  className="h-4 w-4 rounded-full border border-gray-300 text-primary focus:ring-2 focus:ring-mineshaft-500"
                                  value={ApprovalStatus.APPROVED}
                                  aria-labelledby="approve-label"
                                >
                                  <RadioGroupIndicator className="flex h-full w-full items-center justify-center after:h-2 after:w-2 after:rounded-full after:bg-current" />
                                </RadioGroupItem>
                                <span
                                  id="approve-label"
                                  className="cursor-pointer"
                                  onClick={() => field.onChange(ApprovalStatus.APPROVED)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      field.onChange(ApprovalStatus.APPROVED);
                                    }
                                  }}
                                  tabIndex={0}
                                  role="button"
                                >
                                  Approve
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem
                                  id="reject"
                                  className="h-4 w-4 rounded-full border border-gray-300 text-primary focus:ring-2 focus:ring-mineshaft-500"
                                  value={ApprovalStatus.REJECTED}
                                  aria-labelledby="reject-label"
                                >
                                  <RadioGroupIndicator className="flex h-full w-full items-center justify-center after:h-2 after:w-2 after:rounded-full after:bg-current" />
                                </RadioGroupItem>
                                <span
                                  id="reject-label"
                                  className="cursor-pointer"
                                  onClick={() => field.onChange(ApprovalStatus.REJECTED)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      field.onChange(ApprovalStatus.REJECTED);
                                    }
                                  }}
                                  tabIndex={0}
                                  role="button"
                                >
                                  Reject
                                </span>
                              </div>
                            </RadioGroup>
                          </FormControl>
                        )}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          isLoading={isApproving || isRejecting || isSubmitting}
                          variant="outline_bg"
                        >
                          Submit Review
                        </Button>
                      </div>
                    </div>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </div>
        <div className="flex flex-col space-y-4">
          {secretApprovalRequestDetails.commits.map(
            ({ op, secretVersion, secret, ...newVersion }, index) => (
              <SecretApprovalRequestChangeItem
                op={op}
                conflicts={secretApprovalRequestDetails.conflicts}
                hasMerged={hasMerged}
                secretVersion={secretVersion}
                presentSecretVersionNumber={secret?.version || 0}
                newVersion={newVersion}
                key={`${op}-${index + 1}-${secretVersion?.id}`}
              />
            )
          )}
        </div>
        <div className="mt-4 flex flex-col items-center rounded-lg">
          {secretApprovalRequestDetails?.policy?.approvers
            .filter((requiredApprover) => reviewedUsers?.[requiredApprover.userId])
            .map((requiredApprover) => {
              const reviewer = reviewedUsers?.[requiredApprover.userId];
              return (
                <div
                  className="mb-4 flex w-full flex-col rounded-md bg-mineshaft-800 p-6"
                  key={`required-approver-${requiredApprover.userId}`}
                >
                  <div>
                    <span className="ml-1">
                      {`${requiredApprover.firstName || ""} ${requiredApprover.lastName || ""}`} (
                      {requiredApprover?.email}) has{" "}
                    </span>
                    <span
                      className={`${reviewer?.status === ApprovalStatus.APPROVED ? "text-green-500" : "text-red-500"}`}
                    >
                      {reviewer?.status === ApprovalStatus.APPROVED ? "approved" : "rejected"}
                    </span>{" "}
                    the request.
                  </div>
                  {reviewer?.comment && (
                    <FormControl label="Comment" className="mb-0 mt-2">
                      <TextArea value={reviewer.comment} isDisabled reSize="none">
                        {reviewer?.comment && reviewer.comment}
                      </TextArea>
                    </FormControl>
                  )}
                </div>
              );
            })}
        </div>
        <div className="flex items-center space-x-6 rounded-lg bg-mineshaft-800 px-5 py-6">
          <SecretApprovalRequestAction
            canApprove={canApprove}
            approvalRequestId={secretApprovalRequestDetails.id}
            hasMerged={hasMerged}
            approvals={secretApprovalRequestDetails.policy.approvals || 0}
            status={secretApprovalRequestDetails.status}
            isMergable={isMergable}
            statusChangeByEmail={secretApprovalRequestDetails.statusChangedByUser?.email}
            enforcementLevel={secretApprovalRequestDetails.policy.enforcementLevel}
            workspaceId={workspaceId}
          />
        </div>
      </div>
      <div className="sticky top-0 w-1/5 pt-4" style={{ minWidth: "240px" }}>
        <div className="text-sm text-bunker-300">Reviewers</div>
        <div className="mt-2 flex flex-col space-y-2 text-sm">
          {secretApprovalRequestDetails?.policy?.approvers
            .filter(
              (requiredApprover) =>
                !(shouldBlockSelfReview && requiredApprover.userId === userSession.id)
            )
            .map((requiredApprover) => {
              const reviewer = reviewedUsers?.[requiredApprover.userId];
              return (
                <div
                  className="flex flex-nowrap items-center space-x-2 rounded bg-mineshaft-800 px-2 py-1"
                  key={`required-approver-${requiredApprover.userId}`}
                >
                  <div className="flex-grow text-sm">
                    <Tooltip
                      content={`${requiredApprover.firstName || ""} ${
                        requiredApprover.lastName || ""
                      }`}
                    >
                      <span>{requiredApprover?.email} </span>
                    </Tooltip>
                    <span className="text-red">*</span>
                  </div>
                  <div>
                    {reviewer?.comment && (
                      <Tooltip content={reviewer.comment}>
                        <FontAwesomeIcon
                          icon={faComment}
                          size="xs"
                          className="mr-1 text-mineshaft-300"
                        />
                      </Tooltip>
                    )}
                    <Tooltip content={reviewer?.status || ApprovalStatus.PENDING}>
                      {getReviewedStatusSymbol(reviewer?.status)}
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          {secretApprovalRequestDetails?.reviewers
            .filter(
              (reviewer) =>
                !secretApprovalRequestDetails?.policy?.approvers?.some(
                  ({ userId }) => userId === reviewer.userId
                )
            )
            .map((reviewer) => {
              const status = reviewedUsers?.[reviewer.userId].status;
              return (
                <div
                  className="flex flex-nowrap items-center space-x-2 rounded bg-mineshaft-800 px-2 py-1"
                  key={`required-approver-${reviewer.userId}`}
                >
                  <div className="flex-grow text-sm">
                    <Tooltip content={`${reviewer.firstName || ""} ${reviewer.lastName || ""}`}>
                      <span>{reviewer?.email} </span>
                    </Tooltip>
                    <span className="text-red">*</span>
                  </div>
                  <div>
                    {reviewer.comment && (
                      <Tooltip content={reviewer.comment}>
                        <FontAwesomeIcon
                          icon={faComment}
                          size="xs"
                          className="mr-1 text-mineshaft-300"
                        />
                      </Tooltip>
                    )}
                    <Tooltip content={status || ApprovalStatus.PENDING}>
                      {getReviewedStatusSymbol(status)}
                    </Tooltip>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
