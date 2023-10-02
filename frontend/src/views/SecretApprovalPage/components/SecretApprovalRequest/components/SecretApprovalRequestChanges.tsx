import { ReactNode } from "react";
import {
  faArrowLeft,
  faCheck,
  faCheckCircle,
  faCircle,
  faCodeBranch,
  faXmarkCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  ContentLoader,
  IconButton,
  SecretInput,
  Table,
  TableContainer,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useUser } from "@app/context";
import {
  useGetSecretApprovalRequestDetails,
  useGetUserWsKey,
  usePerformSecretApprovalRequestMerge,
  useUpdateSecretApprovalRequestStatus
} from "@app/hooks/api";
import { ApprovalStatus, CommitType, TWorkspaceUser } from "@app/hooks/api/types";

import { useNotificationContext } from "~/components/context/Notifications/NotificationProvider";

import { SecretApprovalRequestAction } from "./SecretApprovalRequestAction";

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
  } = useUpdateSecretApprovalRequestStatus();
  const { mutateAsync: performSecretApprovalMerge, isLoading: isMerging } =
    usePerformSecretApprovalRequestMerge();

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

  const handleSecretApprovalRequestMerge = async () => {
    try {
      await performSecretApprovalMerge({
        id: approvalRequestId
      });
      createNotification({
        type: "success",
        text: "Successfully merged the request"
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
    <div>
      <ContentLoader />
    </div>;
  }

  if (!isSecretApprovalRequestSuccess) return <div>Failed</div>;

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
            <div className="text-sm text-bunker-300">
              {committer?.user?.firstName}
              {committer?.user?.lastName} ({committer?.user?.email}) wants to change{" "}
              {secretApprovalRequestDetails.commits.length} secret values in{" "}
              <span className="text-blue-300 bg-blue-600/60 px-1">
                {secretApprovalRequestDetails.environment}
              </span>
            </div>
          </div>
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
        </div>
        <div className="flex flex-col space-y-4">
          {secretApprovalRequestDetails.commits.map(({ op, secretVersion, newVersion }, index) => (
            <div key={`commit-change-secret-${index + 1}`}>
              <TableContainer>
                <Table>
                  <THead>
                    <Tr>
                      {op === CommitType.UPDATE && <Th className="w-12" />}
                      <Th className="min-table-row">Secret</Th>
                      <Th>Value</Th>
                      <Th className="min-table-row">Comment</Th>
                      <Th className="min-table-row">Tags</Th>
                    </Tr>
                  </THead>
                  {op === CommitType.UPDATE ? (
                    <TBody>
                      <Tr>
                        <Td className="text-red-600">OLD</Td>
                        <Td>{secretVersion?.key}</Td>
                        <Td>
                          <SecretInput isReadOnly value={secretVersion?.value} />
                        </Td>
                        <Td>{secretVersion?.comment}</Td>
                        <Td>
                          {secretVersion?.tags?.map(({ name, _id: tagId, tagColor }) => (
                            <Tag
                              className="flex items-center space-x-2 w-min"
                              key={`${secretVersion._id}-${tagId}`}
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: tagColor || "#bec2c8" }}
                              />
                              <div className="text-sm">{name}</div>
                            </Tag>
                          ))}
                        </Td>
                      </Tr>
                      <Tr>
                        <Td className="text-green-600">NEW</Td>
                        <Td>{newVersion?.secretKey}</Td>
                        <Td>
                          <SecretInput isReadOnly value={newVersion?.secretValue} />
                        </Td>
                        <Td>{newVersion?.secretComment}</Td>
                        <Td>
                          {newVersion?.tags?.map(({ name, _id: tagId, tagColor }) => (
                            <Tag
                              className="flex items-center space-x-2 w-min"
                              key={`${newVersion._id}-${tagId}`}
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: tagColor || "#bec2c8" }}
                              />
                              <div className="text-sm">{name}</div>
                            </Tag>
                          ))}
                        </Td>
                      </Tr>
                    </TBody>
                  ) : (
                    <TBody>
                      <Tr>
                        <Td>
                          {op === CommitType.CREATE ? newVersion?.secretKey : secretVersion?.key}
                        </Td>
                        <Td>
                          <SecretInput
                            isReadOnly
                            value={
                              op === CommitType.CREATE
                                ? newVersion?.secretValue
                                : secretVersion?.value
                            }
                          />
                        </Td>
                        <Td>
                          {op === CommitType.CREATE
                            ? newVersion?.secretComment
                            : secretVersion?.comment}
                        </Td>
                        <Td>
                          {(op === CommitType.CREATE ? newVersion?.tags : secretVersion?.tags)?.map(
                            ({ name, _id: tagId, tagColor }) => (
                              <Tag
                                className="flex items-center space-x-2 w-min"
                                key={`${
                                  op === CommitType.CREATE ? newVersion?._id : secretVersion?._id
                                }-${tagId}`}
                              >
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: tagColor || "#bec2c8" }}
                                />
                                <div className="text-sm">{name}</div>
                              </Tag>
                            )
                          )}
                        </Td>
                      </Tr>
                    </TBody>
                  )}
                </Table>
              </TableContainer>
            </div>
          ))}
        </div>
        <div className="flex items-center px-4 py-6 rounded-lg space-x-6 bg-mineshaft-800 mt-8">
          <SecretApprovalRequestAction
            hasMerged={hasMerged}
            status={secretApprovalRequestDetails.status}
            isMerging={isMerging}
            isMergable={isMergable}
            onMerge={handleSecretApprovalRequestMerge}
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
