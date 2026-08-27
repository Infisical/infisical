import { useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  FilterIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import {
  AccessRestrictedNotice,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  TProjectPermission,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionActions } from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useGetSecretApprovalPolicies,
  useGetWorkspaceUsers,
  useListWorkspaceGroups
} from "@app/hooks/api";
import { useGetAccessApprovalPolicies } from "@app/hooks/api/accessApproval/queries";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { PolicyType } from "@app/hooks/api/policies/enums";
import { Project, TAccessApprovalPolicy } from "@app/hooks/api/types";

import { AccessPolicyForm } from "./components/AccessPolicyModal";
import { ApprovalPolicyRow } from "./components/ApprovalPolicyRow";
import { EnvironmentFilterSelect } from "./components/EnvironmentFilterSelect";
import { RemoveApprovalPolicyModal } from "./components/RemoveApprovalPolicyModal";

interface IProps {
  projectId: string;
}

enum PolicyOrderBy {
  Name = "name",
  Environment = "environment",
  SecretPath = "secret-path",
  Type = "type"
}

type PolicyFilters = {
  type: null | PolicyType;
  environmentIds: string[];
};

const useApprovalPolicies = (permission: TProjectPermission, currentProject?: Project) => {
  const canReadPolicies = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretApproval
  );
  const {
    data: accessPolicies,
    isPending: isAccessPoliciesLoading,
    isError: isAccessPoliciesError,
    isFetching: isAccessPoliciesFetching,
    refetch: refetchAccessPolicies
  } = useGetAccessApprovalPolicies({
    projectSlug: currentProject?.slug as string,
    options: {
      enabled: canReadPolicies && !!currentProject?.slug
    }
  });
  const {
    data: secretPolicies,
    isPending: isSecretPoliciesLoading,
    isError: isSecretPoliciesError,
    isFetching: isSecretPoliciesFetching,
    refetch: refetchSecretPolicies
  } = useGetSecretApprovalPolicies({
    projectId: currentProject?.id as string,
    options: {
      enabled: canReadPolicies && !!currentProject?.id
    }
  });

  // merge data sorted by updatedAt
  const policies = [
    ...(accessPolicies?.map((policy) => ({ ...policy, policyType: PolicyType.AccessPolicy })) ||
      []),
    ...(secretPolicies?.map((policy) => ({ ...policy, policyType: PolicyType.ChangePolicy })) || [])
  ].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return {
    policies,
    isLoading: canReadPolicies && (isAccessPoliciesLoading || isSecretPoliciesLoading),
    isError: isAccessPoliciesError || isSecretPoliciesError,
    isRetrying: isAccessPoliciesFetching || isSecretPoliciesFetching,
    refetchAccessPolicies,
    refetchSecretPolicies
  };
};

export const ApprovalPolicyList = ({ projectId }: IProps) => {
  const { handlePopUpToggle, handlePopUpOpen, popUp } = usePopUp([
    "policyForm",
    "deletePolicy",
    "upgradePlan"
  ] as const);
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { currentProject } = useProject();

  const canReadMembers = permission.can(
    ProjectPermissionMemberActions.Read,
    ProjectPermissionSub.Member
  );
  const canReadGroups = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Groups);

  const {
    data: members,
    isError: isMembersError,
    isFetching: isMembersFetching,
    isPending: isMembersPending,
    refetch: refetchMembers
  } = useGetWorkspaceUsers(projectId, true, undefined, {
    enabled: canReadMembers && Boolean(projectId)
  });
  const {
    data: groups,
    isError: isGroupsError,
    isFetching: isGroupsFetching,
    isPending: isGroupsPending,
    refetch: refetchGroups
  } = useListWorkspaceGroups(currentProject?.id || "", undefined, {
    enabled: canReadGroups && Boolean(currentProject?.id)
  });

  const {
    policies,
    isLoading: isPoliciesLoading,
    isError: isPoliciesError,
    isRetrying: isPoliciesRetrying,
    refetchAccessPolicies,
    refetchSecretPolicies
  } = useApprovalPolicies(permission, currentProject);

  const canReadPolicies = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretApproval
  );
  const canCreatePolicies = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretApproval
  );
  const canEditPolicies = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.SecretApproval
  );
  const canDeletePolicies = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.SecretApproval
  );
  const isApproverOptionsError =
    (canReadMembers && isMembersError) || (canReadGroups && isGroupsError);
  const isApproverOptionsLoading =
    (canReadMembers && isMembersPending) || (canReadGroups && isGroupsPending);
  const isApproverOptionsRetrying =
    (canReadMembers && isMembersFetching) || (canReadGroups && isGroupsFetching);
  let approverOptionsDisabledReason: string | undefined;

  if (isApproverOptionsLoading) {
    approverOptionsDisabledReason = "Approver options are loading";
  } else if (isApproverOptionsError) {
    approverOptionsDisabledReason = "Approver options are unavailable";
  }

  const addPolicyDisabledReason = canCreatePolicies
    ? approverOptionsDisabledReason
    : "Access restricted";

  const [filters, setFilters] = useState<PolicyFilters>({
    type: null,
    environmentIds: []
  });

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    orderBy,
    setOrderBy,
    setOrderDirection,
    toggleOrderDirection
  } = usePagination<PolicyOrderBy>(PolicyOrderBy.Name, {
    initPerPage: getUserTablePreference("approvalPoliciesTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("approvalPoliciesTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredPolicies = useMemo(
    () =>
      policies
        .filter(({ policyType, environments, name, secretPath }) => {
          if (filters.type && policyType !== filters.type) return false;

          if (
            filters.environmentIds.length &&
            !environments.some((env) => filters.environmentIds.includes(env.id))
          )
            return false;

          const searchValue = search.trim().toLowerCase();

          return (
            name.toLowerCase().includes(searchValue) ||
            environments.some((env) => env.name.toLowerCase().includes(searchValue)) ||
            (secretPath ?? "*").toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [policyOne, policyTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case PolicyOrderBy.Type:
              return policyOne.policyType
                .toLowerCase()
                .localeCompare(policyTwo.policyType.toLowerCase());
            case PolicyOrderBy.Environment:
              // eslint-disable-next-line no-case-declarations
              const getFirstEnvName = (policy: { environments: { name: string }[] }) => {
                if (!policy.environments?.length) return "";
                return (
                  policy.environments
                    .map((env) => env.name?.toLowerCase() || "")
                    .filter((name) => name)
                    .sort()[0] || ""
                );
              };

              return getFirstEnvName(policyOne).localeCompare(getFirstEnvName(policyTwo));
            case PolicyOrderBy.SecretPath:
              return (policyOne.secretPath ?? "*")
                .toLowerCase()
                .localeCompare((policyTwo.secretPath ?? "*").toLowerCase());
            case PolicyOrderBy.Name:
            default:
              return policyOne.name.toLowerCase().localeCompare(policyTwo.name.toLowerCase());
          }
        }),
    [policies, filters, search, orderBy, orderDirection]
  );

  useResetPageHelper({
    totalCount: filteredPolicies.length,
    offset,
    setPage
  });

  const handleSort = (column: PolicyOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: PolicyOrderBy) => twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: PolicyOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? (
      <ArrowUpIcon />
    ) : (
      <ArrowDownIcon />
    );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Policies
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pr-workflows" />
          </CardTitle>
          <CardDescription>
            Implement granular policies for access requests and secrets management
          </CardDescription>
          <CardAction>
            <Tooltip open={addPolicyDisabledReason ? undefined : false}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    onClick={() => {
                      if (subscription && !subscription?.secretApproval) {
                        handlePopUpOpen("upgradePlan");
                        return;
                      }
                      handlePopUpOpen("policyForm");
                    }}
                    variant="project"
                    isDisabled={Boolean(addPolicyDisabledReason)}
                  >
                    <PlusIcon />
                    Add Policy
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{addPolicyDisabledReason}</TooltipContent>
            </Tooltip>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!canReadPolicies ? (
            <AccessRestrictedNotice title="Access Restricted" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <EnvironmentFilterSelect
                  environments={currentProject.environments}
                  selectedEnvironmentIds={filters.environmentIds}
                  onChange={(environmentIds) => setFilters((prev) => ({ ...prev, environmentIds }))}
                />
                <InputGroup className="flex-1">
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search policies by name, type, environment or secret path..."
                    aria-label="Search approval policies"
                  />
                </InputGroup>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      aria-label="Filter policies"
                      variant={filters.type !== null ? "project" : "outline"}
                    >
                      <FilterIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="max-h-[70vh] thin-scrollbar overflow-y-auto"
                    align="end"
                  >
                    <DropdownMenuLabel>Policy Type</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={filters.type ?? "all"}
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          type: value === "all" ? null : (value as PolicyType)
                        }))
                      }
                    >
                      <DropdownMenuRadioItem value="all">All Policies</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value={PolicyType.AccessPolicy}>
                        Access Policy
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value={PolicyType.ChangePolicy}>
                        Change Policy
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {isPoliciesError && (
                <Alert variant="danger">
                  <CircleAlertIcon />
                  <AlertTitle>Could not load all approval policies</AlertTitle>
                  <AlertDescription>
                    <span>Retry to restore the complete policy list.</span>
                    <Button
                      size="xs"
                      variant="danger"
                      isPending={isPoliciesRetrying}
                      isDisabled={isPoliciesRetrying}
                      onClick={() => {
                        refetchAccessPolicies().catch(() => undefined);
                        refetchSecretPolicies().catch(() => undefined);
                      }}
                    >
                      <RefreshCwIcon />
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {isApproverOptionsError && (
                <Alert variant="danger">
                  <CircleAlertIcon />
                  <AlertTitle>Could not load approver options</AlertTitle>
                  <AlertDescription>
                    <span>Retry before creating or editing an approval policy.</span>
                    <Button
                      size="xs"
                      variant="danger"
                      isPending={isApproverOptionsRetrying}
                      isDisabled={isApproverOptionsRetrying}
                      onClick={() => {
                        if (canReadMembers) refetchMembers().catch(() => undefined);
                        if (canReadGroups) refetchGroups().catch(() => undefined);
                      }}
                    >
                      <RefreshCwIcon />
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {(isPoliciesLoading || filteredPolicies.length > 0) && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex items-center">
                          Name
                          <IconButton
                            variant="ghost-muted"
                            size="xs"
                            className={getClassName(PolicyOrderBy.Name)}
                            aria-label="Sort by name"
                            onClick={() => handleSort(PolicyOrderBy.Name)}
                          >
                            {getColSortIcon(PolicyOrderBy.Name)}
                          </IconButton>
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center">
                          Environment
                          <IconButton
                            variant="ghost-muted"
                            size="xs"
                            className={getClassName(PolicyOrderBy.Environment)}
                            aria-label="Sort by environment"
                            onClick={() => handleSort(PolicyOrderBy.Environment)}
                          >
                            {getColSortIcon(PolicyOrderBy.Environment)}
                          </IconButton>
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center">
                          Secret Path
                          <IconButton
                            variant="ghost-muted"
                            size="xs"
                            className={getClassName(PolicyOrderBy.SecretPath)}
                            aria-label="Sort by secret path"
                            onClick={() => handleSort(PolicyOrderBy.SecretPath)}
                          >
                            {getColSortIcon(PolicyOrderBy.SecretPath)}
                          </IconButton>
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="flex items-center">
                          Type
                          <IconButton
                            variant="ghost-muted"
                            size="xs"
                            className={getClassName(PolicyOrderBy.Type)}
                            aria-label="Sort by type"
                            onClick={() => handleSort(PolicyOrderBy.Type)}
                          >
                            {getColSortIcon(PolicyOrderBy.Type)}
                          </IconButton>
                        </div>
                      </TableHead>
                      <TableHead className="w-5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPoliciesLoading &&
                      Array.from({ length: 5 }).map((_, idx) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <TableRow key={`policy-skeleton-${idx}`}>
                          <TableCell>
                            <Skeleton className="h-5" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-5" />
                          </TableCell>
                        </TableRow>
                      ))}
                    {!isPoliciesLoading &&
                      !!currentProject &&
                      filteredPolicies
                        ?.slice(offset, perPage * page)
                        .map((policy) => (
                          <ApprovalPolicyRow
                            policy={policy}
                            key={policy.id}
                            members={members}
                            groups={groups}
                            canEdit={
                              canEditPolicies &&
                              !isApproverOptionsLoading &&
                              !isApproverOptionsError
                            }
                            canDelete={canDeletePolicies}
                            editDisabledReason={approverOptionsDisabledReason}
                            onEdit={() => handlePopUpOpen("policyForm", policy)}
                            onDelete={() => handlePopUpOpen("deletePolicy", policy)}
                          />
                        ))}
                  </TableBody>
                </Table>
              )}
              {!isPoliciesLoading && !isPoliciesError && !policies?.length && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No Policies Found</EmptyTitle>
                    <EmptyDescription>
                      Create a policy to require approval for secret changes and access requests.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {Boolean(
                !filteredPolicies.length &&
                  policies.length &&
                  !isPoliciesLoading &&
                  !isPoliciesError
              ) && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No Policies Match Search</EmptyTitle>
                    <EmptyDescription>Try adjusting your search or filters.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {Boolean(filteredPolicies.length) && (
                <Pagination
                  count={filteredPolicies.length}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={handlePerPageChange}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
      <AccessPolicyForm
        projectId={currentProject.id}
        projectSlug={currentProject.slug}
        isOpen={popUp.policyForm.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("policyForm", isOpen)}
        members={members}
        groups={groups}
        hasApproverOptionsError={isApproverOptionsError}
        isRetryingApproverOptions={isApproverOptionsRetrying}
        onRetryApproverOptions={() => {
          if (canReadMembers) refetchMembers().catch(() => undefined);
          if (canReadGroups) refetchGroups().catch(() => undefined);
        }}
        editValues={popUp.policyForm.data as TAccessApprovalPolicy}
      />
      {popUp.deletePolicy.data && (
        <RemoveApprovalPolicyModal
          isOpen={popUp.deletePolicy.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
          policyType={popUp.deletePolicy.data.policyType}
          policyId={popUp.deletePolicy.data.id}
        />
      )}
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Adding secret approval policies can be unlocked if you upgrade to Infisical Pro plan."
      />
    </>
  );
};
