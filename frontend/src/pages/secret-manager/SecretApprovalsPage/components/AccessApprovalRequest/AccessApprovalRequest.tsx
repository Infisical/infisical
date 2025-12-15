/* eslint-disable no-nested-ternary */
/* eslint-disable react/jsx-no-useless-fragment */
import { useCallback, useMemo, useState } from "react";
import {
  faCheck,
  faCheckCircle,
  faChevronDown,
  faLock,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistance } from "date-fns";
import { BanIcon, CheckIcon, ClipboardCheckIcon, LucideIcon, TimerIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Pagination,
  Tooltip
} from "@app/components/v2";
import { Badge, DocumentationLinkBadge } from "@app/components/v3";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription,
  useUser
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useGetWorkspaceUsers } from "@app/hooks/api";
import {
  accessApprovalKeys,
  useGetAccessApprovalPolicies,
  useGetAccessApprovalRequests,
  useGetAccessRequestsCount
} from "@app/hooks/api/accessApproval/queries";
import { TAccessApprovalRequest } from "@app/hooks/api/accessApproval/types";
import { EnforcementLevel } from "@app/hooks/api/policies/enums";
import { queryClient } from "@app/hooks/api/reactQuery";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { ApprovalStatus, TWorkspaceUser } from "@app/hooks/api/types";

import { RequestAccessModal } from "./components/RequestAccessModal";
import { ReviewAccessRequestModal } from "./components/ReviewAccessModal";

const generateRequestText = (request: TAccessApprovalRequest) => {
  const { isTemporary } = request;

  return (
    <div className="flex items-center justify-between text-sm">
      <div>
        Requested {isTemporary ? "temporary" : "permanent"} access to{" "}
        <code className="mx-1 rounded-sm bg-mineshaft-600 px-1.5 py-0.5 font-mono text-[13px] text-mineshaft-200">
          {request.policy.secretPath}
        </code>{" "}
        in{" "}
        <code className="mx-1 rounded-sm bg-mineshaft-600 px-1.5 py-0.5 font-mono text-[13px] text-mineshaft-200">
          {request.environmentName}
        </code>
      </div>
    </div>
  );
};

export const AccessApprovalRequest = ({
  projectSlug,
  projectId
}: {
  projectSlug: string;
  projectId: string;
}) => {
  const [selectedRequest, setSelectedRequest] = useState<
    | (TAccessApprovalRequest & {
        user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
        isRequestedByCurrentUser: boolean;
        isSelfApproveAllowed: boolean;
        isApprover: boolean;
        isDisabled?: boolean;
      })
    | null
  >(null);

  const { handlePopUpOpen, popUp, handlePopUpClose } = usePopUp([
    "requestAccess",
    "reviewRequest",
    "upgradePlan"
  ] as const);
  const { permission } = useProjectPermission();
  const { user } = useUser();
  const { subscription } = useSubscription();
  const { currentProject } = useProject();

  const { data: members } = useGetWorkspaceUsers(projectId, true);
  const membersGroupById = members?.reduce<Record<string, TWorkspaceUser>>(
    (prev, curr) => ({ ...prev, [curr.user.id]: curr }),
    {}
  );

  const [statusFilter, setStatusFilter] = useState<"open" | "close">("open");
  const [requestedByFilter, setRequestedByFilter] = useState<string | undefined>(undefined);
  const [envFilter, setEnvFilter] = useState<string | undefined>(undefined);

  const { data: requestCount } = useGetAccessRequestsCount({
    projectSlug
  });

  const { data: policies, isPending: policiesLoading } = useGetAccessApprovalPolicies({
    projectSlug
  });

  const {
    data: requests,
    refetch: refetchRequests,
    isPending: areRequestsPending
  } = useGetAccessApprovalRequests({
    projectSlug,
    authorUserId: requestedByFilter,
    envSlug: envFilter
  });

  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("", {
    initPerPage: getUserTablePreference("accessRequestsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("accessRequestsTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredRequests = useMemo(() => {
    let accessRequests: typeof requests;

    if (statusFilter === "open")
      accessRequests = requests?.filter(
        (request) =>
          !request.policy.deletedAt &&
          !request.isApproved &&
          !request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED)
      );
    if (statusFilter === "close")
      accessRequests = requests?.filter(
        (request) =>
          request.policy.deletedAt ||
          request.isApproved ||
          request.reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED)
      );

    return (
      accessRequests?.filter((request) => {
        const { environmentName, requestedByUser } = request;

        const searchValue = search.trim().toLowerCase();

        return (
          environmentName?.toLowerCase().includes(searchValue) ||
          `${requestedByUser?.email ?? ""} ${requestedByUser?.firstName ?? ""} ${requestedByUser?.lastName ?? ""}`
            .toLowerCase()
            .includes(searchValue)
        );
      }) ?? []
    );
  }, [requests, statusFilter, requestedByFilter, envFilter, search]);

  useResetPageHelper({
    totalCount: filteredRequests.length,
    offset,
    setPage
  });

  const generateRequestDetails = useCallback(
    (request: TAccessApprovalRequest) => {
      const isReviewedByUser =
        request.reviewers.findIndex(({ userId }) => userId === user.id) !== -1;
      const isRejectedByAnyone = request.reviewers.some(
        ({ status }) => status === ApprovalStatus.REJECTED
      );
      const isApprover =
        request.policy.approvers.findIndex((el) => el.userId === user.id || "") !== -1;
      const isAccepted = request.isApproved;
      const isSoftEnforcement = request.policy.enforcementLevel === EnforcementLevel.Soft;
      const isRequestedByCurrentUser = request.requestedByUserId === user.id;
      const isSelfApproveAllowed = request.policy.allowedSelfApprovals;
      const userReviewStatus = request.reviewers.find(({ userId }) => userId === user.id)?.status;
      const canBypass =
        !request.policy.bypassers.length || request.policy.bypassers.includes(user.id);

      let displayData: {
        label: string;
        type: "warning" | "danger" | "success";
        tooltipContent?: string;
        icon: LucideIcon | null;
      } = {
        label: "",
        type: "warning",
        icon: null
      };

      const isExpired =
        request.privilege &&
        request.isApproved &&
        new Date() > new Date(request.privilege.temporaryAccessEndTime || ("" as string));

      if (isExpired)
        displayData = {
          label: "Access Expired",
          type: "danger",
          icon: TimerIcon,
          tooltipContent: request.privilege?.temporaryAccessEndTime
            ? `Expired ${format(request.privilege.temporaryAccessEndTime, "M/d/yyyy h:mm aa")}`
            : undefined
        };
      else if (isAccepted)
        displayData = {
          label: "Access Granted",
          type: "success",
          icon: CheckIcon,
          tooltipContent: `Granted ${format(request.updatedAt, "M/d/yyyy h:mm aa")}`
        };
      else if (isRejectedByAnyone)
        displayData = {
          label: "Rejected",
          type: "danger",
          icon: BanIcon,
          tooltipContent: `Rejected ${format(request.updatedAt, "M/d/yyyy h:mm aa")}`
        };
      else if (userReviewStatus === ApprovalStatus.APPROVED) {
        displayData = {
          label: "Pending Additional Reviews",
          type: "warning",
          icon: ClipboardCheckIcon
        };
      } else if (!isReviewedByUser)
        displayData = {
          label: "Review Required",
          type: "warning",
          icon: ClipboardCheckIcon
        };

      return {
        displayData,
        isReviewedByUser,
        isRejectedByAnyone,
        isApprover,
        userReviewStatus,
        isAccepted,
        isSoftEnforcement,
        canBypass,
        isRequestedByCurrentUser,
        isSelfApproveAllowed
      };
    },
    [user]
  );

  const handleSelectRequest = useCallback(
    (request: TAccessApprovalRequest) => {
      const details = generateRequestDetails(request);
      if (membersGroupById?.[request.requestedByUserId].user || details.isRequestedByCurrentUser) {
        setSelectedRequest({
          ...request,
          user:
            details.isRequestedByCurrentUser || !membersGroupById?.[request.requestedByUserId].user
              ? user
              : membersGroupById?.[request.requestedByUserId].user,
          isRequestedByCurrentUser: details.isRequestedByCurrentUser,
          isSelfApproveAllowed: details.isSelfApproveAllowed,
          isApprover: details.isApprover
        });
      }

      handlePopUpOpen("reviewRequest");
    },
    [generateRequestDetails, membersGroupById, user, setSelectedRequest, handlePopUpOpen]
  );

  const isFiltered = Boolean(search || envFilter || requestedByFilter);

  return (
    <>
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">Access Requests</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/access-requests" />
            </div>
            <p className="text-sm text-bunker-300">
              Request and review access to secrets in sensitive environments and folders
            </p>
          </div>
          <Tooltip
            content="To submit Access Requests, your project needs to create Access Request policies first."
            isDisabled={policiesLoading || !!policies?.length}
          >
            <Button
              onClick={() => {
                if (
                  subscription &&
                  !subscription?.get(SubscriptionProductCategory.SecretManager, "secretApproval")
                ) {
                  handlePopUpOpen("upgradePlan", {
                    text: "Access requests feature can be unlocked if you upgrade to Infisical Pro plan."
                  });
                  return;
                }
                handlePopUpOpen("requestAccess");
              }}
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              isDisabled={policiesLoading || !policies?.length}
            >
              Request Access
            </Button>
          </Tooltip>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search approval requests by requesting user or environment..."
          className="flex-1"
          containerClassName="mb-4"
        />
        <div className="flex items-center space-x-8 rounded-t-md border-x border-t border-mineshaft-600 bg-mineshaft-800 px-8 py-3 text-sm">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter("open")}
            onKeyDown={(evt) => {
              if (evt.key === "Enter") setStatusFilter("open");
            }}
            className={twMerge(
              "font-medium",
              statusFilter === "close" && "text-gray-500 duration-100 hover:text-gray-400"
            )}
          >
            <FontAwesomeIcon icon={faLock} className="mr-2" />
            {!!requestCount && requestCount?.pendingCount} Pending
          </div>
          <div
            className={twMerge(
              "font-medium",
              statusFilter === "open" && "text-gray-500 duration-100 hover:text-gray-400"
            )}
            role="button"
            tabIndex={0}
            onClick={() => setStatusFilter("close")}
            onKeyDown={(evt) => {
              if (evt.key === "Enter") setStatusFilter("close");
            }}
          >
            <FontAwesomeIcon icon={faCheck} className="mr-2" />
            {!!requestCount && requestCount.finalizedCount} Closed
          </div>
          <div className="flex grow justify-end space-x-8">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button
                  variant="plain"
                  colorSchema="secondary"
                  className={envFilter ? "text-white" : "text-bunker-300"}
                  rightIcon={<FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />}
                >
                  Environments
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={1}
                className="max-h-80 thin-scrollbar overflow-y-auto"
              >
                <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                  Select an Environment
                </DropdownMenuLabel>
                {currentProject?.environments.map(({ slug, name }) => (
                  <DropdownMenuItem
                    onClick={() => setEnvFilter((state) => (state === slug ? undefined : slug))}
                    key={`request-filter-${slug}`}
                    icon={envFilter === slug && <FontAwesomeIcon icon={faCheckCircle} />}
                    iconPos="right"
                  >
                    {name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {!!permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member) && (
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button
                    variant="plain"
                    colorSchema="secondary"
                    className={requestedByFilter ? "text-white" : "text-bunker-300"}
                    rightIcon={<FontAwesomeIcon icon={faChevronDown} size="sm" className="ml-2" />}
                  >
                    Requested By
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={1}
                  className="max-h-80 thin-scrollbar overflow-y-auto"
                >
                  <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                    Select Requesting User
                  </DropdownMenuLabel>
                  {members?.map(({ user: membershipUser, id }) => (
                    <DropdownMenuItem
                      onClick={() =>
                        setRequestedByFilter((state) =>
                          state === membershipUser.id ? undefined : membershipUser.id
                        )
                      }
                      key={`request-filter-member-${id}`}
                      icon={
                        requestedByFilter === membershipUser.id && (
                          <FontAwesomeIcon icon={faCheckCircle} />
                        )
                      }
                      iconPos="right"
                    >
                      {membershipUser.username}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <div className="flex flex-col rounded-b-md border-x border-t border-b border-mineshaft-600 bg-mineshaft-800">
          {filteredRequests?.length === 0 && !isFiltered && (
            <div className="py-12">
              <EmptyState
                title={`No ${statusFilter === "open" ? "Pending" : "Closed"} Access Requests`}
              />
            </div>
          )}
          {Boolean(!filteredRequests?.length && isFiltered && !areRequestsPending) && (
            <div className="py-12">
              <EmptyState title="No Requests Match Filters" icon={faSearch} />
            </div>
          )}
          {!!filteredRequests?.length &&
            filteredRequests?.slice(offset, perPage * page).map((request) => {
              const details = generateRequestDetails(request);

              const StatusIcon = details.displayData.icon;

              return (
                <div
                  key={request.id}
                  className="flex w-full cursor-pointer border-b border-mineshaft-600 px-8 py-3 last:border-b-0 hover:bg-mineshaft-700 aria-disabled:opacity-80"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectRequest(request)}
                  onKeyDown={(evt) => {
                    if (evt.key === "Enter") {
                      handleSelectRequest(request);
                    }
                  }}
                >
                  <div className="flex flex-1 items-center justify-between">
                    <div className="flex w-full flex-col justify-between">
                      <div className="mb-1 flex w-full items-center">
                        <FontAwesomeIcon
                          icon={faLock}
                          size="xs"
                          className="mr-1.5 text-mineshaft-300"
                        />
                        {generateRequestText(request)}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs leading-3 text-gray-500">
                          {membersGroupById?.[request.requestedByUserId]?.user && (
                            <>
                              Requested {formatDistance(new Date(request.createdAt), new Date())}{" "}
                              ago by{" "}
                              {membersGroupById?.[request.requestedByUserId]?.user?.firstName}{" "}
                              {membersGroupById?.[request.requestedByUserId]?.user?.lastName} (
                              {membersGroupById?.[request.requestedByUserId]?.user?.email}){" "}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {request.requestedByUserId === user.id && (
                        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap text-bunker-300">
                          <FontAwesomeIcon icon={faUser} size="sm" />
                          <span>Requested By You</span>
                        </div>
                      )}
                      <Tooltip content={details.displayData.tooltipContent}>
                        <Badge variant={details.displayData.type}>
                          {StatusIcon && <StatusIcon />}
                          {details.displayData.label}
                        </Badge>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          {Boolean(filteredRequests.length) && (
            <Pagination
              className="border-none"
              count={filteredRequests.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </div>
      </div>
      {!!policies && (
        <RequestAccessModal
          policies={policies}
          isOpen={popUp.requestAccess.isOpen}
          onOpenChange={() => {
            queryClient.invalidateQueries({
              queryKey: accessApprovalKeys.getAccessApprovalRequests(
                projectSlug,
                envFilter,
                requestedByFilter
              )
            });
            handlePopUpClose("requestAccess");
          }}
        />
      )}

      {!!selectedRequest && (
        <ReviewAccessRequestModal
          selectedEnvSlug={envFilter}
          policies={policies || []}
          selectedRequester={requestedByFilter}
          projectSlug={projectSlug}
          request={selectedRequest}
          members={members || []}
          isOpen={popUp.reviewRequest.isOpen}
          onOpenChange={() => {
            handlePopUpClose("reviewRequest");
            setSelectedRequest(null);
            refetchRequests();
          }}
          onUpdate={(request) => {
            // scott: this isn't ideal but our current use of state makes this complicated...
            // we shouldn't be using state like this...
            handleSelectRequest({
              ...selectedRequest,
              isTemporary: request.isTemporary,
              temporaryRange: request.temporaryRange,
              reviewers: []
            });
          }}
          canBypass={generateRequestDetails(selectedRequest).canBypass}
        />
      )}

      <UpgradePlanModal
        text={popUp.upgradePlan.data?.text}
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={() => handlePopUpClose("upgradePlan")}
      />
    </>
  );
};
