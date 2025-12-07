import { useMemo, useState } from "react";
import {
  faCheckCircle,
  faChevronRight,
  faExclamationCircle,
  faFileCircleQuestion,
  faFilter,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import {
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
import { getUserTablePreference, PreferenceKey } from "@app/helpers/userTablePreferences";
import { usePagination } from "@app/hooks";
import { ApprovalPolicyType, ApproverType } from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  TApprovalRequest
} from "@app/hooks/api/approvalRequests";

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

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  }
  return `${minutes}m`;
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

export const RequestsTable = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { memberships } = useProjectPermission();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(ApprovalRequestStatus.Pending);

  const projectId = currentProject?.id || "";
  const userId = user?.id || "";
  const userGroups = memberships.map((el) => el.actorGroupId).filter(Boolean);

  const { data: requests = [], isPending: isRequestsLoading } = useQuery(
    approvalRequestQuery.list({
      policyType: ApprovalPolicyType.PamAccess,
      projectId
    })
  );

  const { page, perPage, setPage, setPerPage, offset } = usePagination("", {
    initPerPage: getUserTablePreference("PamApprovalRequestTable", PreferenceKey.PerPage, 10)
  });

  const filteredRequests = useMemo(() => {
    let filtered = requests;

    // Apply search filter
    if (search) {
      filtered = filtered.filter(
        (request) =>
          request.requesterName?.toLowerCase().includes(search.toLowerCase()) ||
          request.requesterEmail?.toLowerCase().includes(search.toLowerCase()) ||
          request.justification?.toLowerCase().includes(search.toLowerCase()) ||
          request.requestData.requestData.resourceId.toLowerCase().includes(search.toLowerCase()) ||
          request.requestData.requestData.accountPath.toLowerCase().includes(search.toLowerCase())
      );
    }

    return filtered
      .filter((req) => req.status === filter)
      .sort(
        (a, b) => (new Date(b.createdAt)?.getTime() || 0) - (new Date(a.createdAt)?.getTime() || 0)
      );
  }, [requests, search, filter]);

  const paginatedRequests = useMemo(
    () => filteredRequests.slice(offset, offset + perPage),
    [filteredRequests, offset, perPage]
  );

  const handleRowClick = (requestId: string) => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/approval-requests/$approvalRequestId",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id,
        approvalRequestId: requestId
      }
    });
  };

  const isTableFiltered = filter !== ApprovalRequestStatus.Pending;

  return (
    <div>
      <div className="flex gap-2">
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
          placeholder="Search approval requests..."
        />
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>Requester</Th>
              <Th>Account Path</Th>
              <Th>Duration</Th>
              <Th>Status</Th>
              <Th>Requested</Th>
            </Tr>
          </THead>
          <TBody>
            {isRequestsLoading && <TableSkeleton columns={5} innerKey="approval-requests" />}
            {!isRequestsLoading &&
              paginatedRequests.map((request) => {
                const needsApproval = checkIfUserNeedsToApprove(request, userId, userGroups);
                const { accountPath, requestDurationSeconds } = request.requestData.requestData;

                return (
                  <Tr
                    key={request.id}
                    className={twMerge(
                      "cursor-pointer transition-colors hover:bg-mineshaft-700",
                      needsApproval && "bg-primary/5 hover:bg-primary/10"
                    )}
                    onClick={() => handleRowClick(request.id)}
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
                      <div>
                        <div className="text-sm text-mineshaft-200">{accountPath}</div>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-sm text-mineshaft-200">
                        {formatDuration(requestDurationSeconds)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge variant={getStatusBadgeColor(request.status)}>
                          {request.status}
                        </Badge>
                        {needsApproval && (
                          <div className="flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-xs text-primary">
                            <FontAwesomeIcon icon={faExclamationCircle} className="h-3 w-3" />
                            <span>Approval Required</span>
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-sm text-mineshaft-400">
                        {formatDistance(new Date(request.createdAt), new Date(), {
                          addSuffix: true
                        })}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {Boolean(filteredRequests.length) && (
          <Pagination
            count={filteredRequests.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!isRequestsLoading && !filteredRequests?.length && (
          <EmptyState
            title="No approval requests found"
            icon={requests.length ? faSearch : faFileCircleQuestion}
          />
        )}
      </TableContainer>
    </div>
  );
};
