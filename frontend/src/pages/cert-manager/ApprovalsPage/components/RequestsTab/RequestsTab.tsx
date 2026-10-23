import { useMemo, useState } from "react";
import {
  faExclamationCircle,
  faFileCircleQuestion,
  faFilter,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission, useUser } from "@app/context";
import { getUserTablePreference, PreferenceKey } from "@app/helpers/userTablePreferences";
import { usePagination } from "@app/hooks";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApproverType
} from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  CertRequestRequestData,
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

export const RequestsTab = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const { memberships } = useProjectPermission();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(ApprovalRequestStatus.Pending);
  const navigate = useNavigate();

  const projectId = currentProject?.id || "";
  const userId = user?.id || "";
  const userGroups = memberships.map((el) => el.actorGroupId).filter(Boolean);

  const { data: requests = [], isPending: isRequestsLoading } = useQuery(
    approvalRequestQuery.list({
      policyType: ApprovalPolicyType.CertRequest,
      scope: ApprovalPolicyScope.Project,
      scopeId: projectId
    })
  );

  const { page, perPage, setPage, setPerPage, offset } = usePagination("", {
    initPerPage: getUserTablePreference("CertApprovalRequestTable", PreferenceKey.PerPage, 10)
  });

  const filteredRequests = useMemo(() => {
    let filtered = requests;

    if (search) {
      filtered = filtered.filter((request) => {
        const requestData = request.requestData.requestData as CertRequestRequestData;
        return (
          request.requesterName?.toLowerCase().includes(search.toLowerCase()) ||
          request.requesterEmail?.toLowerCase().includes(search.toLowerCase()) ||
          request.justification?.toLowerCase().includes(search.toLowerCase()) ||
          requestData.profileName?.toLowerCase().includes(search.toLowerCase()) ||
          requestData.certificateRequest?.commonName?.toLowerCase().includes(search.toLowerCase())
        );
      });
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

  const isTableFiltered = filter !== ApprovalRequestStatus.Pending;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Certificate Approval Requests</CardTitle>
        <CardDescription>
          Review and manage certificate requests that require approval.
        </CardDescription>
        <div className="col-span-full flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label="Filter Requests"
                variant={isTableFiltered ? "project" : "outline"}
              >
                <FontAwesomeIcon icon={faFilter} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Filter By</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={filter}
                onValueChange={(value) => {
                  setFilter(value as ApprovalRequestStatus);
                  setPage(1);
                }}
              >
                <DropdownMenuRadioItem value={ApprovalRequestStatus.Pending}>
                  Open Requests
                </DropdownMenuRadioItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Closed Requests</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                    <DropdownMenuRadioItem value={ApprovalRequestStatus.Approved}>
                      Approved
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value={ApprovalRequestStatus.Cancelled}>
                      Cancelled
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value={ApprovalRequestStatus.Rejected}>
                      Rejected
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value={ApprovalRequestStatus.Expired}>
                      Expired
                    </DropdownMenuRadioItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <InputGroup>
            <InputGroupAddon>
              <FontAwesomeIcon icon={faSearch} />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search certificate requests..."
            />
          </InputGroup>
        </div>
      </CardHeader>
      <CardContent>
        {isRequestsLoading || filteredRequests.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requester</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Common Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isRequestsLoading && <TableSkeletonRows columns={5} />}
              {!isRequestsLoading &&
                paginatedRequests.map((request) => {
                  const needsApproval = checkIfUserNeedsToApprove(request, userId, userGroups);
                  const requestData = request.requestData.requestData as CertRequestRequestData;

                  return (
                    <TableRow
                      key={request.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/cert-manager/approvals/$approvalRequestId",
                          params: {
                            orgId: currentOrg.id,
                            approvalRequestId: request.id
                          },
                          search: {
                            policyType: ApprovalPolicyType.CertRequest
                          }
                        })
                      }
                    >
                      <TableCell>
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {request.requesterName || "Unknown"}
                          </div>
                          <div className="text-xs text-muted">{request.requesterEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell>{requestData.profileName}</TableCell>
                      <TableCell>{requestData.certificateRequest?.commonName || "-"}</TableCell>
                      <TableCell>
                        {needsApproval ? (
                          <Badge variant="warning">
                            <FontAwesomeIcon icon={faExclamationCircle} />
                            Approval Required
                          </Badge>
                        ) : (
                          <Badge
                            className="capitalize"
                            variant={getStatusBadgeColor(request.status)}
                          >
                            {request.status.split("-").join(" ")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted">
                        {formatDistance(new Date(request.createdAt), new Date(), {
                          addSuffix: true
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FontAwesomeIcon icon={requests.length ? faSearch : faFileCircleQuestion} />
              </EmptyMedia>
              <EmptyTitle>No Certificate Approval Requests Found</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
      {Boolean(filteredRequests.length) && (
        <CardFooter>
          <Pagination
            count={filteredRequests.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={(value) => {
              setPerPage(value);
              setPage(1);
            }}
          />
        </CardFooter>
      )}
    </Card>
  );
};
