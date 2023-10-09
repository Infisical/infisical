import { ReactNode } from "react";
import {
  faArrowLeft,
  faCheck,
  faCheckCircle,
  faCircle,
  faCodeBranch,
  faFolder,
  faXmarkCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, ContentLoader, EmptyState, IconButton, Tooltip } from "@app/components/v2";
import { useUser } from "@app/context";
import {
  useGetSecretApprovalRequestDetails,
  useGetUserWsKey,
  useUpdateSecretApprovalReviewStatus
} from "@app/hooks/api";
import { ApprovalStatus, CommitType, TWorkspaceUser } from "@app/hooks/api/types";

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
  committer?: TWorkspaceUser;
  members?: Record<string, TWorkspaceUser>;
};

export const SecretApprovalRequestChanges = ({
  approvalRequestId,
  onGoBack,
  committer,
  workspaceId,
  members = {}
}: Props) => {
  const { createNotification } = useNotificationContext();
  const { user } = useUser();
  const { data: decryptFileKey } = useGetUserWsKey(workspaceId);
  const {
    data: secretApprovalRequestDetails,
    isSuccess: isSecretApprovalRequestSuccess,
    isLoading: isSecretApprovalRequestLoading
  } = useGetSecretApprovalRequestDetails({
    id: approvalRequestId,
    decryptKey: decryptFileKey!
  });

  const {
    mutateAsync: updateSecretApprovalRequestStatus,
    isLoading: isUpdatingRequestStatus,
    variables
  } = useUpdateSecretApprovalReviewStatus();

  const isApproving = variables?.status === ApprovalStatus.APPROVED && isUpdatingRequestStatus;
  const isRejecting = variables?.status === ApprovalStatus.REJECTED && isUpdatingRequestStatus;

  // membership of present user
  const myMembership = Object.values(members).find(
    ({ user: membershipUser }) => membershipUser.email === user.email
  );
  const myMembershipId = myMembership?._id || "";
  const reviewedMembers = secretApprovalRequestDetails?.reviewers?.reduce<
    Record<string, ApprovalStatus>
  >(
    (prev, curr) => ({
      ...prev,
      [curr.member]: curr.status
    }),
    {}
  );
  const hasApproved = reviewedMembers?.[myMembershipId] === ApprovalStatus.APPROVED;
  const hasRejected = reviewedMembers?.[myMembershipId] === ApprovalStatus.REJECTED;

  const handleSecretApprovalStatusUpdate = async (status: ApprovalStatus) => {
    try {
      await updateSecretApprovalRequestStatus({
        id: approvalRequestId,
        status
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
      (approverId) => reviewedMembers?.[approverId] === ApprovalStatus.APPROVED
    ).length;
  const hasMerged = secretApprovalRequestDetails?.hasMerged;

  return (
    <div className="flex space-x-6">
      <div className="flex-grow">
        <div className="flex items-center space-x-4 pt-2 pb-6 sticky top-0 z-20 bg-bunker-800">
          <IconButton variant="outline_bg" ariaLabel="go-back" onClick={onGoBack}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </IconButton>
          <div className="bg-red-600 text-white flex items-center space-x-2 px-4 py-2 rounded-3xl">
            <FontAwesomeIcon icon={faCodeBranch} size="sm" />
            <span>{secretApprovalRequestDetails.status}</span>
          </div>
          <div className="flex flex-col flex-grow">
            <div className="text-lg mb-1">
              {generateCommitText(secretApprovalRequestDetails.commits)}
            </div>
            <div className="text-sm text-bunker-300 flex items-center">
              {committer?.user?.firstName}
              {committer?.user?.lastName} ({committer?.user?.email}) wants to change{" "}
              {secretApprovalRequestDetails.commits.length} secret values in
              <span className="text-primary-300 bg-primary-600/60 px-1 mx-1 rounded">
                {secretApprovalRequestDetails.environment}
              </span>
              <div className="flex items-center border border-mineshaft-500 pl-1 pr-2 rounded w-min">
                <div className="border-r border-mineshaft-500 pr-1">
                  <FontAwesomeIcon icon={faFolder} className="text-primary" size="sm" />
                </div>
                <div className="text-sm pl-2 pb-0.5">{secretApprovalRequestDetails.secretPath}</div>
              </div>
            </div>
          </div>
          {!hasMerged && secretApprovalRequestDetails.status === "open" && (
            <>
              <Button
                size="xs"
                leftIcon={hasApproved && <FontAwesomeIcon icon={faCheck} />}
                onClick={() => handleSecretApprovalStatusUpdate(ApprovalStatus.APPROVED)}
                isLoading={isApproving}
                isDisabled={isApproving || hasApproved}
              >
                {hasApproved ? "Approved" : "Approve"}
              </Button>
              <Button
                size="xs"
                colorSchema="danger"
                leftIcon={hasRejected && <FontAwesomeIcon icon={faCheck} />}
                onClick={() => handleSecretApprovalStatusUpdate(ApprovalStatus.REJECTED)}
                isLoading={isRejecting}
                isDisabled={isRejecting || hasRejected}
              >
                {hasRejected ? "Rejected" : "Reject"}
              </Button>
            </>
          )}
        </div>
        <div className="flex flex-col space-y-4">
          {secretApprovalRequestDetails.commits.map(
            ({ op, secretVersion, secret, newVersion }, index) => (
              <SecretApprovalRequestChangeItem
                op={op}
                conflicts={secretApprovalRequestDetails.conflicts}
                hasMerged={hasMerged}
                secretVersion={secretVersion}
                presentSecretVersionNumber={secret?.version || 0}
                newVersion={newVersion}
                key={`${op}-${index + 1}-${secretVersion?._id}`}
              />
            )
          )}
        </div>
        <div className="flex items-center px-5 py-6 rounded-lg space-x-6 bg-mineshaft-800 mt-8">
          <SecretApprovalRequestAction
            approvalRequestId={secretApprovalRequestDetails._id}
            hasMerged={hasMerged}
            approvals={secretApprovalRequestDetails.policy.approvals || 0}
            status={secretApprovalRequestDetails.status}
            isMergable={isMergable}
            statusChangeByEmail={
              members[secretApprovalRequestDetails?.statusChangeBy || ""]?.user?.email || ""
            }
            workspaceId={workspaceId}
          />
        </div>
      </div>
      <div className="w-1/5 pt-4 sticky top-0" style={{ minWidth: "240px" }}>
        <div className="text-sm text-bunker-300">Reviewers</div>
        <div className="mt-2 flex flex-col space-y-2 text-sm">
          {secretApprovalRequestDetails?.policy?.approvers.map((requiredApproverId) => {
            const userDetails = members?.[requiredApproverId]?.user;
            const status = reviewedMembers?.[requiredApproverId];
            return (
              <div
                className="flex items-center space-x-2 flex-nowrap bg-mineshaft-800 px-2 py-1 rounded"
                key={`required-approver-${requiredApproverId}`}
              >
                <div className="flex-grow text-sm">
                  <Tooltip content={`${userDetails.firstName} ${userDetails.lastName}`}>
                    <span>{userDetails?.email} </span>
                  </Tooltip>
                  <span className="text-red">*</span>
                </div>
                <div>
                  <Tooltip content={status || ApprovalStatus.PENDING}>
                    {getReviewedStatusSymbol(status)}
                  </Tooltip>
                </div>
              </div>
            );
          })}
          {secretApprovalRequestDetails?.reviewers
            .filter(
              ({ member }) => !secretApprovalRequestDetails?.policy?.approvers?.includes(member)
            )
            .map((reviewer) => {
              const userDetails = members?.[reviewer.member]?.user;
              const status = reviewedMembers?.[reviewer.status];
              return (
                <div
                  className="flex items-center space-x-2 flex-nowrap bg-mineshaft-800 px-2 py-1 rounded"
                  key={`required-approver-${reviewer.member}`}
                >
                  <div className="flex-grow text-sm">
                    <Tooltip content={`${userDetails.firstName} ${userDetails.lastName}`}>
                      <span>{userDetails?.email} </span>
                    </Tooltip>
                    <span className="text-red">*</span>
                  </div>
                  <div>
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
