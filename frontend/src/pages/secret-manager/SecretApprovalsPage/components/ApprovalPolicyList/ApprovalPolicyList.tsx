import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faBookOpen,
  faCheckCircle,
  faFileShield,
  faFilter,
  faMagnifyingGlass,
  faPlus,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
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
import {
  ProjectPermissionSub,
  TProjectPermission,
  useProjectPermission,
  useSubscription,
  useWorkspace
} from "@app/context";
import { ProjectPermissionActions } from "@app/context/ProjectPermissionContext/types";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useDeleteAccessApprovalPolicy,
  useDeleteSecretApprovalPolicy,
  useGetSecretApprovalPolicies,
  useGetWorkspaceUsers,
  useListWorkspaceGroups
} from "@app/hooks/api";
import { useGetAccessApprovalPolicies } from "@app/hooks/api/accessApproval/queries";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { PolicyType } from "@app/hooks/api/policies/enums";
import { TAccessApprovalPolicy, Workspace } from "@app/hooks/api/types";

import { AccessPolicyForm } from "./components/AccessPolicyModal";
import { ApprovalPolicyRow } from "./components/ApprovalPolicyRow";

interface IProps {
  workspaceId: string;
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

const useApprovalPolicies = (permission: TProjectPermission, currentWorkspace?: Workspace) => {
  const { data: accessPolicies, isPending: isAccessPoliciesLoading } = useGetAccessApprovalPolicies(
    {
      projectSlug: currentWorkspace?.slug as string,
      options: {
        enabled:
          permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
          !!currentWorkspace?.slug
      }
    }
  );
  const { data: secretPolicies, isPending: isSecretPoliciesLoading } = useGetSecretApprovalPolicies(
    {
      workspaceId: currentWorkspace?.id as string,
      options: {
        enabled:
          permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval) &&
          !!currentWorkspace?.id
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

export const ApprovalPolicyList = ({ workspaceId }: IProps) => {
  const { handlePopUpToggle, handlePopUpOpen, handlePopUpClose, popUp } = usePopUp([
    "policyForm",
    "deletePolicy",
    "upgradePlan"
  ] as const);
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();

  const { data: members } = useGetWorkspaceUsers(workspaceId, true);
  const { data: groups } = useListWorkspaceGroups(currentWorkspace?.id || "");

  const { policies, isLoading: isPoliciesLoading } = useApprovalPolicies(
    permission,
    currentWorkspace
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
        .filter(({ policyType, environment, name, secretPath }) => {
          if (filters.type && policyType !== filters.type) return false;

          if (filters.environmentIds.length && !filters.environmentIds.includes(environment.id))
            return false;

          const searchValue = search.trim().toLowerCase();

          return (
            name.toLowerCase().includes(searchValue) ||
            environment.name.toLowerCase().includes(searchValue) ||
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
              return policyOne.environment.name
                .toLowerCase()
                .localeCompare(policyTwo.environment.name.toLowerCase());
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

  const { mutateAsync: deleteSecretApprovalPolicy } = useDeleteSecretApprovalPolicy();
  const { mutateAsync: deleteAccessApprovalPolicy } = useDeleteAccessApprovalPolicy();

  const handleDeletePolicy = async () => {
    const { id, policyType } = popUp.deletePolicy.data as TAccessApprovalPolicy;
    if (!currentWorkspace?.slug) return;

    try {
      if (policyType === PolicyType.ChangePolicy) {
        await deleteSecretApprovalPolicy({
          workspaceId,
          id
        });
      } else {
        await deleteAccessApprovalPolicy({
          projectSlug: currentWorkspace?.slug,
          id
        });
      }
      createNotification({
        type: "success",
        text: "Successfully deleted policy"
      });
      handlePopUpClose("deletePolicy");
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to delete policy"
      });
    }
  };

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
    <AnimatePresence mode="wait">
      <motion.div
        key="approval-changes-list"
        transition={{ duration: 0.1 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
        className="rounded-md text-gray-300"
      >
        <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex items-start gap-1">
                <p className="text-xl font-semibold text-mineshaft-100">Policies</p>
                <a
                  href="https://infisical.com/docs/documentation/platform/pr-workflows"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="ml-1 mt-[0.32rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                    <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                    <span>Docs</span>
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.07rem] ml-1.5 text-[10px]"
                    />
                  </div>
                </a>
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
                    if (subscription && !subscription?.secretApproval) {
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
                className="thin-scrollbar max-h-[70vh] overflow-y-auto"
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
                {currentWorkspace.environments.map((env) => (
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
                {!!currentWorkspace &&
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
      </motion.div>
      <AccessPolicyForm
        projectId={currentWorkspace.id}
        projectSlug={currentWorkspace.slug}
        isOpen={popUp.policyForm.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("policyForm", isOpen)}
        members={members}
        editValues={popUp.policyForm.data as TAccessApprovalPolicy}
      />
      <DeleteActionModal
        isOpen={popUp.deletePolicy.isOpen}
        deleteKey="remove"
        title="Do you want to remove this policy?"
        onChange={(isOpen) => handlePopUpToggle("deletePolicy", isOpen)}
        onDeleteApproved={handleDeletePolicy}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You can add secret approval policy if you switch to Infisical's Enterprise plan."
      />
    </AnimatePresence>
  );
};
