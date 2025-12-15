import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFileShield,
  faFilter,
  faMagnifyingGlass,
  faPlus,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
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
import { DocumentationLinkBadge } from "@app/components/v3";
import {
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
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { Project, TAccessApprovalPolicy } from "@app/hooks/api/types";

import { AccessPolicyForm } from "./components/AccessPolicyModal";
import { ApprovalPolicyRow } from "./components/ApprovalPolicyRow";
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
  const { data: accessPolicies, isPending: isAccessPoliciesLoading } = useGetAccessApprovalPolicies(
    {
      projectSlug: currentProject?.slug as string,
      options: {
        enabled:
          permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
          !!currentProject?.slug
      }
    }
  );
  const { data: secretPolicies, isPending: isSecretPoliciesLoading } = useGetSecretApprovalPolicies(
    {
      projectId: currentProject?.id as string,
      options: {
        enabled:
          permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
          !!currentProject?.id
      }
    }
  );

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
    isLoading: isAccessPoliciesLoading || isSecretPoliciesLoading
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

  const { data: members } = useGetWorkspaceUsers(projectId, true);
  const { data: groups } = useListWorkspaceGroups(currentProject?.id || "");

  const { policies, isLoading: isPoliciesLoading } = useApprovalPolicies(
    permission,
    currentProject
  );

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

  const isTableFiltered = filters.type !== null || Boolean(filters.environmentIds.length);

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
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  return (
    <>
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">Policies</p>
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pr-workflows" />
            </div>
            <p className="text-sm text-bunker-300">
              Implement granular policies for access requests and secrets management
            </p>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={ProjectPermissionSub.SecretApproval}
          >
            {(isAllowed) => (
              <Button
                onClick={() => {
                  if (
                    subscription &&
                    !subscription?.get(SubscriptionProductCategory.SecretManager, "secretApproval")
                  ) {
                    handlePopUpOpen("upgradePlan");
                    return;
                  }
                  handlePopUpOpen("policyForm");
                }}
                colorSchema="secondary"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                isDisabled={!isAllowed}
              >
                Create Policy
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <div className="mb-4 flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search policies by name, type, environment or secret path..."
            className="flex-1"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Filter findings"
                variant="plain"
                size="sm"
                className={twMerge(
                  "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                  isTableFiltered && "border-primary/50 text-primary"
                )}
              >
                <FontAwesomeIcon icon={faFilter} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="max-h-[70vh] thin-scrollbar overflow-y-auto"
              align="end"
            >
              <DropdownMenuLabel>Policy Type</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    type: null
                  }))
                }
                icon={!filters && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                All
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    type: PolicyType.AccessPolicy
                  }))
                }
                icon={
                  filters.type === PolicyType.AccessPolicy && (
                    <FontAwesomeIcon icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                Access Policy
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    type: PolicyType.ChangePolicy
                  }))
                }
                icon={
                  filters.type === PolicyType.ChangePolicy && (
                    <FontAwesomeIcon icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                Change Policy
              </DropdownMenuItem>
              <DropdownMenuLabel>Environment</DropdownMenuLabel>
              {currentProject.environments.map((env) => (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setFilters((prev) => ({
                      ...prev,
                      environmentIds: prev.environmentIds.includes(env.id)
                        ? prev.environmentIds.filter((i) => i !== env.id)
                        : [...prev.environmentIds, env.id]
                    }));
                  }}
                  key={env.id}
                  icon={
                    filters.environmentIds.includes(env.id) && (
                      <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                    )
                  }
                  iconPos="right"
                >
                  <span className="capitalize">{env.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>
                  <div className="flex items-center">
                    Name
                    <IconButton
                      variant="plain"
                      className={getClassName(PolicyOrderBy.Name)}
                      ariaLabel="sort"
                      onClick={() => handleSort(PolicyOrderBy.Name)}
                    >
                      <FontAwesomeIcon icon={getColSortIcon(PolicyOrderBy.Name)} />
                    </IconButton>
                  </div>
                </Th>
                <Th>
                  <div className="flex items-center">
                    Environment
                    <IconButton
                      variant="plain"
                      className={getClassName(PolicyOrderBy.Environment)}
                      ariaLabel="sort"
                      onClick={() => handleSort(PolicyOrderBy.Environment)}
                    >
                      <FontAwesomeIcon icon={getColSortIcon(PolicyOrderBy.Environment)} />
                    </IconButton>
                  </div>
                </Th>
                <Th>
                  <div className="flex items-center">
                    Secret Path
                    <IconButton
                      variant="plain"
                      className={getClassName(PolicyOrderBy.SecretPath)}
                      ariaLabel="sort"
                      onClick={() => handleSort(PolicyOrderBy.SecretPath)}
                    >
                      <FontAwesomeIcon icon={getColSortIcon(PolicyOrderBy.SecretPath)} />
                    </IconButton>
                  </div>
                </Th>
                <Th>
                  <div className="flex items-center">
                    Type
                    <IconButton
                      variant="plain"
                      className={getClassName(PolicyOrderBy.Type)}
                      ariaLabel="sort"
                      onClick={() => handleSort(PolicyOrderBy.Type)}
                    >
                      <FontAwesomeIcon icon={getColSortIcon(PolicyOrderBy.Type)} />
                    </IconButton>
                  </div>
                </Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isPoliciesLoading && (
                <TableSkeleton
                  columns={5}
                  innerKey="secret-policies"
                  className="bg-mineshaft-700"
                />
              )}
              {!isPoliciesLoading && !policies?.length && (
                <Tr>
                  <Td colSpan={5}>
                    <EmptyState title="No Policies Found" icon={faFileShield} />
                  </Td>
                </Tr>
              )}
              {!!currentProject &&
                filteredPolicies
                  ?.slice(offset, perPage * page)
                  .map((policy) => (
                    <ApprovalPolicyRow
                      policy={policy}
                      key={policy.id}
                      members={members}
                      groups={groups}
                      onEdit={() => handlePopUpOpen("policyForm", policy)}
                      onDelete={() => handlePopUpOpen("deletePolicy", policy)}
                    />
                  ))}
            </TBody>
          </Table>
          {Boolean(!filteredPolicies.length && policies.length && !isPoliciesLoading) && (
            <EmptyState title="No Policies Match Search" icon={faSearch} />
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
        </TableContainer>
      </div>
      <AccessPolicyForm
        projectId={currentProject.id}
        projectSlug={currentProject.slug}
        isOpen={popUp.policyForm.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("policyForm", isOpen)}
        members={members}
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
