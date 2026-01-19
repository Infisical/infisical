/* eslint-disable no-nested-ternary */
import { ReactNode, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faAngleDown,
  faArrowLeft,
  faBan,
  faCheck,
  faCodeBranch,
  faComment,
  faFolder,
  faHourglass,
  faUserSlash
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
  GenericFieldLabel,
  IconButton,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useProject, useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useGetSecretApprovalRequestDetails,
  useGetSecretImports,
  usePerformSecretApprovalRequestMerge,
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
        {Boolean(text.length) && " and "}
        {score[CommitType.DELETE]} Secret{score[CommitType.DELETE] !== 1 && "s"}
        <span className="text-red-600"> Deleted</span>
      </span>
    );
  return text;
};

const getReviewedStatusSymbol = (status?: ApprovalStatus) => {
  if (status === ApprovalStatus.APPROVED)
    return <FontAwesomeIcon icon={faCheck} size="xs" className="text-green" />;
  if (status === ApprovalStatus.REJECTED)
    return <FontAwesomeIcon icon={faBan} size="xs" className="text-red" />;

  return <FontAwesomeIcon icon={faHourglass} size="xs" className="text-yellow" />;
};

type Props = {
  approvalRequestId: string;
  onGoBack: () => void;
};

const reviewFormSchema = z.object({
  comment: z.string().trim().optional().default(""),
  status: z.nativeEnum(ApprovalStatus)
});

type TReviewFormSchema = z.infer<typeof reviewFormSchema>;

export const SecretApprovalRequestChanges = ({ approvalRequestId, onGoBack }: Props) => {
  const { user: userSession } = useUser();
  const { projectId } = useProject();
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
    projectId,
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

  const { mutateAsync: performSecretApprovalMerge, isPending: isMerging } =
    usePerformSecretApprovalRequestMerge();

  const [willMerge, setWillMerge] = useState(false);

  const { popUp, handlePopUpToggle } = usePopUp(["reviewChanges"] as const);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
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
    Record<
      string,
      { status: ApprovalStatus; comment: string; isOrgMembershipActive: boolean; createdAt: Date }
    >
  >(
    (prev, curr) => ({
      ...prev,
      [curr.userId]: {
        status: curr.status,
        comment: curr.comment,
        isOrgMembershipActive: curr.isOrgMembershipActive,
        createdAt: curr.createdAt
      }
    }),
    {}
  );

  const handleSecretApprovalStatusUpdate = async (status: ApprovalStatus, comment: string) => {
    await updateSecretApprovalRequestStatus({
      id: approvalRequestId,
      status,
      comment
    });
    createNotification({
      type: "success",
      text: `Successfully ${status} the request`
    });

    handlePopUpToggle("reviewChanges", false);
    reset({
      comment: "",
      status: ApprovalStatus.APPROVED
    });
  };

  const handleSubmitReview = async (data: TReviewFormSchema) => {
    await handleSecretApprovalStatusUpdate(data.status, data.comment);
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
  const isMergableUponApprove =
    secretApprovalRequestDetails?.policy?.approvals <=
      secretApprovalRequestDetails?.policy?.approvers?.filter(
        ({ userId }) =>
          userId === userSession.id || reviewedUsers?.[userId]?.status === ApprovalStatus.APPROVED
      ).length && watch("status") !== ApprovalStatus.REJECTED;

  const isPending = isApproving || isRejecting || isSubmitting || isMerging;

  return (
    <div className="flex flex-col space-x-6 lg:flex-row">
      <div className="flex-1 lg:max-w-[calc(100%-17rem)]">
        <div className="sticky -top-10 z-20 flex items-center space-x-4 bg-bunker-800 pt-2 pb-6">
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
          <div className="-mt-0.5 w-[calc(100%-20rem)] grow flex-col">
            <div className="text-xl">
              {generateCommitText(
                secretApprovalRequestDetails.commits,
                secretApprovalRequestDetails.isReplicated
              )}
            </div>
            <p className="-mt-1 truncate text-sm text-gray-400">
              By{" "}
              {secretApprovalRequestDetails?.committerUser ? (
                <>
                  {secretApprovalRequestDetails?.committerUser?.firstName} (
                  {secretApprovalRequestDetails?.committerUser?.email})
                </>
              ) : (
                <span className="text-gray-500">Deleted User</span>
              )}
            </p>
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
                    colorSchema="secondary"
                    rightIcon={<FontAwesomeIcon className="ml-2" icon={faAngleDown} />}
                  >
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
                              className="text-md mt-2 h-40 border border-mineshaft-600 bg-mineshaft-800 placeholder:text-mineshaft-400"
                            />
                          </FormControl>
                        )}
                      />
                      <div className="flex justify-between">
                        <Controller
                          control={control}
                          name="status"
                          defaultValue={ApprovalStatus.APPROVED}
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              className="mb-0"
                              errorText={error?.message}
                              isError={Boolean(error)}
                            >
                              <RadioGroup
                                value={field.value}
                                onValueChange={field.onChange}
                                className="space-y-2"
                                aria-label="Status"
                              >
                                <div className="flex items-center gap-2">
                                  <RadioGroupItem
                                    id="approve"
                                    className="h-4 w-4 rounded-full border border-gray-400 text-green focus:ring-2 focus:ring-mineshaft-500"
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
                                    className="h-4 w-4 rounded-full border border-gray-400 text-red focus:ring-2 focus:ring-mineshaft-500"
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
                        <div className="flex">
                          <Button
                            type="submit"
                            isLoading={isPending && !willMerge}
                            isDisabled={isPending}
                            variant="outline_bg"
                            className="mt-auto h-min"
                          >
                            Submit Review
                          </Button>
                          {isMergableUponApprove && (
                            <Button
                              onClick={async () => {
                                try {
                                  setWillMerge(true);
                                  await handleSubmit(handleSubmitReview)();
                                  await performSecretApprovalMerge({
                                    projectId,
                                    id: secretApprovalRequestDetails.id
                                  });
                                } catch {
                                  // Approval or merge failed, error already shown via mutation
                                } finally {
                                  setWillMerge(false);
                                }
                              }}
                              variant="solid"
                              className="mt-auto ml-2 h-min"
                              isLoading={isPending && willMerge}
                              isDisabled={isPending}
                            >
                              Approve and Merge
                            </Button>
                          )}
                        </div>
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
                  className="mx-1 inline rounded-sm bg-mineshaft-600/80 text-mineshaft-300"
                  style={{ padding: "2px 4px" }}
                >
                  {secretApprovalRequestDetails?.environment}
                </p>
                <div className="mr-1 inline-flex w-min items-center rounded-sm border border-mineshaft-500 pr-2 pl-1.5">
                  <p className="cursor-default border-r border-mineshaft-500 pr-1.5">
                    <FontAwesomeIcon icon={faFolder} className="text-yellow" size="sm" />
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
                  className="mx-1 inline rounded-sm bg-mineshaft-600/80 text-mineshaft-300"
                  style={{ padding: "2px 4px" }}
                >
                  {replicatedImport?.importEnv?.slug}
                </p>
                <div className="mr-1 inline-flex w-min items-center rounded-sm border border-mineshaft-500 pr-2 pl-1.5">
                  <p className="cursor-default border-r border-mineshaft-500 pr-1.5">
                    <FontAwesomeIcon icon={faFolder} className="text-yellow" size="sm" />
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
                  className="mx-1 inline rounded-sm bg-mineshaft-600/80 text-mineshaft-300"
                  style={{ padding: "2px 4px" }}
                >
                  {secretApprovalRequestDetails?.environment}
                </p>
                <div className="mr-1 inline-flex w-min items-center rounded-sm border border-mineshaft-500 pr-2 pl-1.5">
                  <p className="cursor-default border-r border-mineshaft-500 pr-1.5">
                    <FontAwesomeIcon icon={faFolder} className="text-yellow" size="sm" />
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
                  className="flex w-full flex-col rounded-md bg-mineshaft-800 p-4 text-sm text-mineshaft-100"
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
                    {format(
                      new Date(reviewer ? reviewer.createdAt : new Date()),
                      "MM/dd/yyyy h:mm:ss aa"
                    )}
                    .
                  </div>
                  {reviewer?.comment && (
                    <GenericFieldLabel label="Comment" className="mt-2 max-w-4xl break-words">
                      {reviewer?.comment && reviewer.comment}
                    </GenericFieldLabel>
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
          />
        </div>
      </div>
      <div className="sticky top-0 z-51 w-1/5 cursor-default pt-2" style={{ minWidth: "240px" }}>
        <div className="text-sm text-bunker-300">Reviewers</div>
        <div className="mt-2 flex flex-col space-y-2 text-sm">
          {secretApprovalRequestDetails?.policy?.approvers
            .filter(
              (requiredApprover) =>
                !(shouldBlockSelfReview && requiredApprover.userId === userSession.id)
            )
            .map((requiredApprover) => {
              const reviewer = reviewedUsers?.[requiredApprover.userId];
              const { isOrgMembershipActive } = requiredApprover;

              return (
                <div
                  className="flex flex-nowrap items-center justify-between space-x-2 rounded-sm border border-mineshaft-600 bg-mineshaft-800 px-2 py-1"
                  key={`required-approver-${requiredApprover.userId}`}
                >
                  <div
                    className={twMerge(
                      "flex items-center gap-1 text-sm",
                      !isOrgMembershipActive && "opacity-40"
                    )}
                  >
                    <Tooltip
                      content={
                        !isOrgMembershipActive
                          ? "This user has been deactivated and no longer has an active organization membership."
                          : requiredApprover.firstName
                            ? `${requiredApprover.firstName || ""} ${requiredApprover.lastName || ""}`
                            : undefined
                      }
                      position="left"
                      sideOffset={10}
                    >
                      <div className="flex items-center">
                        <div className="max-w-[200px] truncate">{requiredApprover?.email}</div>
                        <span className="text-red">*</span>
                        {!isOrgMembershipActive && (
                          <FontAwesomeIcon
                            icon={faUserSlash}
                            size="xs"
                            className="ml-1 text-mineshaft-300"
                          />
                        )}
                      </div>
                    </Tooltip>
                  </div>
                  <div className="flex items-center">
                    {reviewer?.comment && (
                      <Tooltip className="max-w-lg break-words" content={reviewer.comment}>
                        <FontAwesomeIcon
                          icon={faComment}
                          size="xs"
                          className="mr-1.5 text-mineshaft-300"
                        />
                      </Tooltip>
                    )}
                    <div className="flex gap-2">
                      <Tooltip
                        className="relative z-500!"
                        content={
                          <span className="text-sm">
                            Status:{" "}
                            <span className="capitalize">
                              {reviewer?.status || ApprovalStatus.PENDING}
                            </span>
                          </span>
                        }
                      >
                        {getReviewedStatusSymbol(reviewer?.status)}
                      </Tooltip>
                    </div>
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
              const { isOrgMembershipActive } = reviewer;
              return (
                <div
                  className="flex flex-nowrap items-center justify-between space-x-2 rounded-sm bg-mineshaft-800 px-2 py-1"
                  key={`required-approver-${reviewer.userId}`}
                >
                  <div
                    className={twMerge(
                      "flex items-center gap-1 text-sm",
                      !isOrgMembershipActive && "opacity-40"
                    )}
                  >
                    <Tooltip
                      className="relative z-500!"
                      content={
                        !isOrgMembershipActive
                          ? "This user has been deactivated and no longer has an active organization membership."
                          : `${reviewer.firstName || ""} ${reviewer.lastName || ""}`
                      }
                    >
                      <div className="flex items-center">
                        <span className="max-w-[200px] truncate">{reviewer?.email}</span>
                        {!isOrgMembershipActive && (
                          <FontAwesomeIcon
                            icon={faUserSlash}
                            size="xs"
                            className="ml-1 text-mineshaft-300"
                          />
                        )}
                      </div>
                    </Tooltip>
                  </div>

                  <div>
                    {reviewer.comment && (
                      <Tooltip className="relative z-500!" content={reviewer.comment}>
                        <FontAwesomeIcon
                          icon={faComment}
                          size="xs"
                          className="mr-1 text-mineshaft-300"
                        />
                      </Tooltip>
                    )}
                    <Tooltip
                      className="relative z-500!"
                      content={
                        <span className="text-sm">
                          Status:{" "}
                          <span className="capitalize">{status || ApprovalStatus.PENDING}</span>
                        </span>
                      }
                    >
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
