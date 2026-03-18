import { useMemo, useState } from "react";
import {
  faCheckCircle,
  faChevronRight,
  faExclamationCircle,
  faFileCircleQuestion,
  faFilter,
  faMagnifyingGlass
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission, useUser } from "@app/context";
import {
  ProjectPermissionCodeSigningActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext";
import { usePagination } from "@app/hooks";
import { ApprovalPolicyType, ApproverType } from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  CodeSigningRequestData,
  TApprovalRequest
} from "@app/hooks/api/approvalRequests";

import { RequestSigningAccessModal } from "./RequestSigningAccessModal";

const getStatusBadgeColor = (status: ApprovalRequestStatus) => {
  switch (status) {
    case ApprovalRequestStatus.Pending:
      return "project";
    case ApprovalRequestStatus.Approved:
      return "success";
    case ApprovalRequestStatus.Rejected:
      return "danger";
    case ApprovalRequestStatus.Expired:
      return "neutral";
    default:
      return "neutral";
  }
};

const checkIfUserNeedsToApprove = (
  request: TApprovalRequest,
  userId: string,
  userGroups: string[]
): boolean => {
  const currentStep = request.steps.find(
    (step) => step.status === ApprovalRequestStepStatus.InProgress
  );

  if (!currentStep) return false;

  const isApprover = currentStep.approvers.some((approver) =>
    approver.type === ApproverType.User ? approver.id === userId : userGroups.includes(approver.id)
  );

  if (!isApprover) return false;

  const hasAlreadyApproved = currentStep.approvals.some(
    (approval) => approval.approverUserId === userId
  );

  return !hasAlreadyApproved;
};

export const CodeSigningRequestsTab = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { memberships } = useProjectPermission();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(ApprovalRequestStatus.Pending);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const navigate = useNavigate();

  const projectId = currentProject?.id || "";
  const userId = user?.id || "";
  const userGroups = memberships.map((el) => el.actorGroupId).filter(Boolean);

  const { data: requests = [], isPending: isRequestsLoading } = useQuery(
    approvalRequestQuery.list({
      policyType: ApprovalPolicyType.CertCodeSigning,
      projectId
    })
  );

  const { page, perPage, setPage, setPerPage, offset } = usePagination("", {
    initPerPage: 10
  });

  const filteredRequests = useMemo(() => {
    let filtered = requests;

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((request) => {
        const reqData = request.requestData.requestData as CodeSigningRequestData;
        const signerName = reqData.signerName || "";
        const requesterName = request.requesterName || "";
        return (
          signerName.toLowerCase().includes(searchLower) ||
          requesterName.toLowerCase().includes(searchLower)
        );
      });
    }

    if (filter) {
      filtered = filtered.filter((request) => request.status === filter);
    }

    return filtered;
  }, [requests, search, filter]);

  const paginatedRequests = filteredRequests.slice(offset, offset + perPage);
  const isTableFiltered = filter !== ApprovalRequestStatus.Pending;

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-x-2">
            <p className="text-xl font-medium text-mineshaft-100">Signing Requests</p>
          </div>
          <p className="text-sm text-bunker-300">Review and manage signing requests</p>
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionCodeSigningActions.Sign}
          a={ProjectPermissionSub.CodeSigners}
        >
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              size="sm"
              isDisabled={!isAllowed}
              onClick={() => setIsRequestModalOpen(true)}
            >
              Request Signing Access
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="mb-4 flex gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Requests"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-9.5 w-[2.6rem] items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-0">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(evt) => {
                evt.preventDefault();
                setFilter(ApprovalRequestStatus.Pending);
              }}
              icon={
                filter === ApprovalRequestStatus.Pending && <FontAwesomeIcon icon={faCheckCircle} />
              }
              iconPos="right"
            >
              Open Requests
            </DropdownMenuItem>
            <DropdownSubMenu>
              <DropdownSubMenuTrigger
                iconPos="right"
                icon={<FontAwesomeIcon icon={faChevronRight} size="sm" />}
              >
                Closed Requests
              </DropdownSubMenuTrigger>
              <DropdownSubMenuContent className="max-h-80 thin-scrollbar overflow-y-auto rounded-l-none">
                <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                  Filter by Status
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={(evt) => {
                    evt.preventDefault();
                    setFilter(ApprovalRequestStatus.Approved);
                  }}
                  icon={
                    filter === ApprovalRequestStatus.Approved && (
                      <FontAwesomeIcon icon={faCheckCircle} />
                    )
                  }
                  iconPos="right"
                >
                  Approved
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(evt) => {
                    evt.preventDefault();
                    setFilter(ApprovalRequestStatus.Cancelled);
                  }}
                  icon={
                    filter === ApprovalRequestStatus.Cancelled && (
                      <FontAwesomeIcon icon={faCheckCircle} />
                    )
                  }
                  iconPos="right"
                >
                  Cancelled
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(evt) => {
                    evt.preventDefault();
                    setFilter(ApprovalRequestStatus.Rejected);
                  }}
                  icon={
                    filter === ApprovalRequestStatus.Rejected && (
                      <FontAwesomeIcon icon={faCheckCircle} />
                    )
                  }
                  iconPos="right"
                >
                  Rejected
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(evt) => {
                    evt.preventDefault();
                    setFilter(ApprovalRequestStatus.Expired);
                  }}
                  icon={
                    filter === ApprovalRequestStatus.Expired && (
                      <FontAwesomeIcon icon={faCheckCircle} />
                    )
                  }
                  iconPos="right"
                >
                  Expired
                </DropdownMenuItem>
              </DropdownSubMenuContent>
            </DropdownSubMenu>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search requests..."
        />
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Requester</Th>
              <Th>Signer</Th>
              <Th>Status</Th>
              <Th>Requested</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isRequestsLoading && <TableSkeleton columns={5} innerKey="cs-requests" />}
            {!isRequestsLoading && paginatedRequests.length === 0 && (
              <Tr>
                <Td colSpan={5}>
                  <EmptyState title="No signing requests found" icon={faFileCircleQuestion} />
                </Td>
              </Tr>
            )}
            {paginatedRequests.map((request) => {
              const needsApproval = checkIfUserNeedsToApprove(request, userId, userGroups);
              const reqData = request.requestData.requestData as CodeSigningRequestData;
              return (
                <Tr
                  key={request.id}
                  className="h-14 cursor-pointer transition-colors hover:bg-mineshaft-700"
                  onClick={() =>
                    navigate({
                      to: "/organizations/$orgId/projects/cert-manager/$projectId/approval-requests/$approvalRequestId",
                      params: {
                        orgId: currentOrg.id,
                        projectId,
                        approvalRequestId: request.id
                      },
                      search: {
                        policyType: ApprovalPolicyType.CertCodeSigning
                      }
                    })
                  }
                >
                  <Td>
                    <div>
                      <div className="text-sm font-medium text-mineshaft-100">
                        {request.requesterName || "Unknown"}
                      </div>
                      <div className="text-xs text-mineshaft-400">{request.requesterEmail}</div>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-sm text-mineshaft-200">
                      {reqData.signerName || "Unknown Signer"}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      {needsApproval ? (
                        <div className="flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-xs text-primary">
                          <FontAwesomeIcon icon={faExclamationCircle} className="h-3 w-3" />
                          <span>Approval Required</span>
                        </div>
                      ) : (
                        <Badge
                          className="capitalize"
                          variant={getStatusBadgeColor(request.status as ApprovalRequestStatus)}
                        >
                          {request.status.split("-").join(" ")}
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-sm text-mineshaft-400">
                      {format(new Date(request.createdAt), "MMM d, yyyy")}
                    </span>
                  </Td>
                  <Td>
                    <FontAwesomeIcon icon={faChevronRight} className="text-bunker-300" />
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </TableContainer>
      {filteredRequests.length > perPage && (
        <Pagination
          count={filteredRequests.length}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={setPerPage}
        />
      )}
      <RequestSigningAccessModal isOpen={isRequestModalOpen} onOpenChange={setIsRequestModalOpen} />
    </div>
  );
};
