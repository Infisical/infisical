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
import { format } from "date-fns";
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
import { useUser, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useGetSecretApprovalRequestDetails,
  useGetSecretImports,
  useUpdateSecretApprovalReviewStatus
} from "@app/hooks/api";
import { ApprovalStatus, CommitType } from "@app/hooks/api/types";
import { formatReservedPaths, parsePathFromReplicatedPath } from "@app/lib/fn/string";

import { SecretApprovalRequestAction } from "./SecretApprovalRequestAction";
import { SecretApprovalRequestChangeItem } from "./SecretApprovalRequestChangeItem";

export const generateCommitText = (commits: { op: CommitType }[] = [], isReplicated = false) => {
  if (isReplicated) {
    return <span>{commits.length} secret pending import</span>;
  }

  const score: Record<string, number> = {};
  commits.forEach(({ op }) => {
    score[op] = (score?.[op] || 0) + 1;
  });
  const text: ReactNode[] = [];
  if (score[CommitType.CREATE])
    text.push(
      <span key="created-commit">
        {score[CommitType.CREATE]} Secret{score[CommitType.CREATE] !== 1 && "s"}
        <span className="text-green-600"> Created</span>
      </span>
    );
  if (score[CommitType.UPDATE])
    text.push(
      <span key="updated-commit">
        {Boolean(text.length) && ", "}
        {score[CommitType.UPDATE]} Secret{score[CommitType.UPDATE] !== 1 && "s"}
        <span className="text-yellow-600"> Updated</span>
      </span>
    );
  if (score[CommitType.DELETE])
    text.push(
      <span className="deleted-commit">
        {Boolean(text.length) && "and"}
        {score[CommitType.DELETE]} Secret{score[CommitType.DELETE] !== 1 && "s"}
        <span className="text-red-600"> Deleted</span>
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
  const { currentWorkspace } = useWorkspace();
  const {
    data: secretApprovalRequestDetails,
    isSuccess: isSecretApprovalRequestSuccess,
    isPending: isSecretApprovalRequestLoading
  } = useGetSecretApprovalRequestDetails({
    id: approvalRequestId
  });
  const approvalSecretPath = parsePathFromReplicatedPath(
    secretApprovalRequestDetails?.secretPath || ""
  );
  const { data: secretImports } = useGetSecretImports({
    environment: secretApprovalRequestDetails?.environment || "",
    projectId: currentWorkspace.id,
    path: approvalSecretPath
  });

  const replicatedImport = secretApprovalRequestDetails?.isReplicated
    ? secretImports?.find(
        (el) => secretApprovalRequestDetails?.secretPath?.includes(el.id) && el.isReplication
      )
    : undefined;

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

  const isBypasser =
    !secretApprovalRequestDetails?.policy?.bypassers ||
    !secretApprovalRequestDetails.policy.bypassers.length ||
    secretApprovalRequestDetails.policy.bypassers.some(({ userId }) => userId === userSession.id);

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
          <div className="flex-grow flex-col">
            <div className="text-xl">
              {generateCommitText(
                secretApprovalRequestDetails.commits,
                secretApprovalRequestDetails.isReplicated
              )}
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              By {secretApprovalRequestDetails?.committerUser?.firstName} (
              {secretApprovalRequestDetails?.committerUser?.email})
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
                  <Button rightIcon={<FontAwesomeIcon className="ml-2" icon={faAngleDown} />}>
                    Review
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" asChild className="mt-3">
                  <form onSubmit={handleSubmit(handleSubmitReview)}>
                    <div className="flex w-[500px] flex-col space-y-2 p-5">
                      <div className="text-md font-medium">Finish your review</div>
                      <Controller
                        control={control}
                        name="comment"
                        render={({ field, fieldState: { error } }) => (
                          <FormControl errorText={error?.message} isError={Boolean(error)}>
                            <TextArea
                              {...field}
                              placeholder="Leave a comment..."
                              reSize="none"
                              className="text-md mt-2 h-40 border border-mineshaft-600 bg-bunker-800"
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
                                  className="h-4 w-4 rounded-full border border-gray-300 text-red focus:ring-2 focus:ring-mineshaft-500"
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
        <div className="mb-4 flex flex-col rounded-r border-l-2 border-l-primary bg-mineshaft-300/5 px-4 py-2.5">
          <div>
            {secretApprovalRequestDetails.isReplicated ? (
              <div className="text-sm text-bunker-300">
                A secret import in
                <p
                  className="mx-1 inline rounded bg-primary-600/40 text-primary-300"
                  style={{ padding: "2px 4px" }}
                >
                  {secretApprovalRequestDetails?.environment}
                </p>
                <div className="mr-2 inline-flex w-min items-center rounded border border-mineshaft-500 pl-1 pr-2">
                  <p className="cursor-default border-r border-mineshaft-500 pr-1">
                    <FontAwesomeIcon icon={faFolder} className="text-primary" size="sm" />
                  </p>
                  <Tooltip content={approvalSecretPath}>
                    <p
                      className="cursor-default truncate pb-0.5 pl-2 text-sm"
                      style={{ maxWidth: "15rem" }}
                    >
                      {approvalSecretPath}
                    </p>
                  </Tooltip>
                </div>
                has pending changes to be accepted from its source at{" "}
                <p
                  className="mx-1 inline rounded bg-primary-600/40 text-primary-300"
                  style={{ padding: "2px 4px" }}
                >
                  {replicatedImport?.importEnv?.slug}
                </p>
                <div className="inline-flex w-min items-center rounded border border-mineshaft-500 pl-1 pr-2">
                  <p className="cursor-default border-r border-mineshaft-500 pr-1">
                    <FontAwesomeIcon icon={faFolder} className="text-primary" size="sm" />
                  </p>
                  <Tooltip content={replicatedImport?.importPath}>
                    <p
                      className="cursor-default truncate pb-0.5 pl-2 text-sm"
                      style={{ maxWidth: "15rem" }}
                    >
                      {replicatedImport?.importPath}
                    </p>
                  </Tooltip>
                </div>
                . Approving these changes will add them to that import.
              </div>
            ) : (
              <div className="text-sm text-bunker-300">
                <p className="inline">Secret(s) in</p>
                <p
                  className="mx-1 inline rounded bg-primary-600/40 text-primary-300"
                  style={{ padding: "2px 4px" }}
                >
                  {secretApprovalRequestDetails?.environment}
                </p>
                <div className="mr-1 inline-flex w-min items-center rounded border border-mineshaft-500 pl-1 pr-2">
                  <p className="cursor-default border-r border-mineshaft-500 pr-1">
                    <FontAwesomeIcon icon={faFolder} className="text-primary" size="sm" />
                  </p>
                  <Tooltip content={formatReservedPaths(secretApprovalRequestDetails.secretPath)}>
                    <p
                      className="cursor-default truncate pb-0.5 pl-2 text-sm"
                      style={{ maxWidth: "20rem" }}
                    >
                      {formatReservedPaths(secretApprovalRequestDetails.secretPath)}
                    </p>
                  </Tooltip>
                </div>
                <p className="inline">
                  have pending changes. Approving these changes will add them to that environment
                  and path.
                </p>
              </div>
            )}
          </div>
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
        <div className="my-4 flex flex-col items-center rounded-lg border border-mineshaft-600">
          {secretApprovalRequestDetails?.policy?.approvers
            .filter((requiredApprover) => reviewedUsers?.[requiredApprover.userId])
            .map((requiredApprover) => {
              const reviewer = reviewedUsers?.[requiredApprover.userId];
              return (
                <div
                  className="flex w-full flex-col rounded-md bg-mineshaft-800 p-4"
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
                    the request on{" "}
                    {format(new Date(secretApprovalRequestDetails.createdAt), "PPpp zzz")}.
                  </div>
                  {reviewer?.comment && (
                    <FormControl label="Comment" className="mb-0 mt-4">
                      <TextArea value={reviewer.comment} isDisabled reSize="none">
                        {reviewer?.comment && reviewer.comment}
                      </TextArea>
                    </FormControl>
                  )}
                </div>
              );
            })}
        </div>
        <div className="mt-2 flex items-center space-x-6 rounded-lg border border-mineshaft-600 bg-mineshaft-800">
          <SecretApprovalRequestAction
            canApprove={canApprove}
            isBypasser={isBypasser === undefined ? true : isBypasser}
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
      <div className="sticky top-0 w-1/5 cursor-default pt-4" style={{ minWidth: "240px" }}>
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
                  className="flex flex-nowrap items-center justify-between space-x-2 rounded border border-mineshaft-600 bg-mineshaft-800 px-2 py-1"
                  key={`required-approver-${requiredApprover.userId}`}
                >
                  <div className="flex text-sm">
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
                    <Tooltip content={`Status: ${reviewer?.status || ApprovalStatus.PENDING}`}>
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
