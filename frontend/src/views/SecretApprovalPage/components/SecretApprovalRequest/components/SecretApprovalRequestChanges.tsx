import { ReactNode } from "react";
import {
  faArrowLeft,
  faCheck,
  faCheckCircle,
  faCircle,
  faClose,
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
import {
  useGetSecretApprovalRequestDetails,
  useGetUserWsKey,
  useUpdateSecretApprovalRequestStatus
} from "@app/hooks/api";
import { ApprovalStatus, CommitType, TWorkspaceUser } from "@app/hooks/api/types";

import { useNotificationContext } from "~/components/context/Notifications/NotificationProvider";

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
  const isApproving = variables?.status === ApprovalStatus.APPROVED && isUpdatingRequestStatus;
  const isRejecting = variables?.status === ApprovalStatus.REJECTED && isUpdatingRequestStatus;

  const reviewedMembers = secretApprovalRequestDetails?.reviewers?.reduce<
    Record<string, ApprovalStatus>
  >(
    (prev, curr) => ({
      ...prev,
      [curr.member]: curr.status
    }),
    {}
  );

  const handleSecretApprovalStatusUpdate = async (status: ApprovalStatus) => {
    try {
      await updateSecretApprovalRequestStatus({
        id: approvalRequestId,
        status
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
            leftIcon={<FontAwesomeIcon icon={faCheck} />}
            onClick={() => handleSecretApprovalStatusUpdate(ApprovalStatus.APPROVED)}
            isLoading={isApproving}
            isDisabled={isApproving}
          >
            Approve
          </Button>
          <Button
            size="xs"
            variant="outline_bg"
            leftIcon={<FontAwesomeIcon icon={faClose} />}
            onClick={() => handleSecretApprovalStatusUpdate(ApprovalStatus.REJECTED)}
            isLoading={isRejecting}
            isDisabled={isRejecting}
          >
            Reject
          </Button>
        </div>
        <div className="flex flex-col space-y-4">
          {secretApprovalRequestDetails.commits.map(({ op, secret, newVersion }, index) => (
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
                        <Td>{secret?.key}</Td>
                        <Td>
                          <SecretInput isReadOnly value={secret?.value} />
                        </Td>
                        <Td>{secret?.comment}</Td>
                        <Td>
                          {secret?.tags?.map(({ name, _id: tagId, tagColor }) => (
                            <Tag
                              className="flex items-center space-x-2 w-min"
                              key={`${secret._id}-${tagId}`}
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
                        <Td>{op === CommitType.CREATE ? newVersion?.secretKey : secret?.key}</Td>
                        <Td>
                          <SecretInput
                            isReadOnly
                            value={
                              op === CommitType.CREATE ? newVersion?.secretValue : secret?.value
                            }
                          />
                        </Td>
                        <Td>
                          {op === CommitType.CREATE ? newVersion?.secretComment : secret?.comment}
                        </Td>
                        <Td>
                          {(op === CommitType.CREATE ? newVersion?.tags : secret?.tags)?.map(
                            ({ name, _id: tagId, tagColor }) => (
                              <Tag
                                className="flex items-center space-x-2 w-min"
                                key={`${
                                  op === CommitType.CREATE ? newVersion?._id : secret?._id
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
          <Button leftIcon={<FontAwesomeIcon icon={faCheck} />}>Merge</Button>
          <Button variant="outline_bg" leftIcon={<FontAwesomeIcon icon={faClose} />}>
            Close request
          </Button>
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
