import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  EditIcon,
  FilterIcon,
  InfoIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { LastLoginSection } from "@app/components/organization/LastLoginSection";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OrgIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  SubOrgIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  identityAuthToNameMap,
  useGetOrgRoles,
  useSearchOrgIdentityMemberships,
  useUpdateOrgIdentity
} from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { OrgIdentityOrderBy } from "@app/hooks/api/organization/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteIdentity"]>,
    data?: {
      identityId: string;
      name: string;
    }
  ) => void;
};

type Filter = {
  roles: string[];
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();

  const {
    offset,
    limit,
    orderBy,
    setOrderBy,
    orderDirection,
    setOrderDirection,
    search,
    debouncedSearch,
    setPage,
    setSearch,
    perPage,
    page,
    setPerPage
  } = usePagination<OrgIdentityOrderBy>(OrgIdentityOrderBy.Name, {
    initPerPage: getUserTablePreference("identityTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("identityTable", PreferenceKey.PerPage, newPerPage);
  };

  const [filter, setFilter] = useState<Filter>({
    roles: []
  });

  const organizationId = currentOrg?.id || "";

  const { mutateAsync: updateMutateAsync } = useUpdateOrgIdentity();

  const { data, isPending } = useSearchOrgIdentityMemberships({
    offset,
    limit,
    orderDirection,
    orderBy,
    search: {
      name: debouncedSearch ? { $contains: debouncedSearch } : undefined,
      role: filter.roles?.length ? { $in: filter.roles } : undefined
    }
  });

  const { totalCount = 0 } = data ?? {};
  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { data: roles } = useGetOrgRoles(organizationId);

  const handleSort = (column: OrgIdentityOrderBy) => {
    if (column === orderBy) {
      setOrderDirection((prev) =>
        prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
      );
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const handleChangeRole = async ({ identityId, role }: { identityId: string; role: string }) => {
    await updateMutateAsync({
      identityId,
      role,
      organizationId
    });

    createNotification({
      text: "Successfully updated machine identity role",
      type: "success"
    });
  };

  const handleRoleToggle = useCallback(
    (roleSlug: string) =>
      setFilter((state) => {
        const currentRoles = state.roles || [];

        if (currentRoles.includes(roleSlug)) {
          return { ...state, roles: currentRoles.filter((role) => role !== roleSlug) };
        }
        return { ...state, roles: [...currentRoles, roleSlug] };
      }),
    []
  );

  const isTableFiltered = Boolean(filter.roles.length);

  const isFiltered = debouncedSearch.trim().length > 0 || isTableFiltered;

  return (
    <>
      <div className="mb-4 flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${isSubOrganization ? "sub-organization" : "organization"} machine identities by name...`}
          />
        </InputGroup>
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton
              variant={
                // eslint-disable-next-line no-nested-ternary
                isTableFiltered ? (isSubOrganization ? "sub-org" : "org") : "outline"
              }
            >
              <FilterIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <UnstableDropdownMenuLabel>Filter by Organization Role</UnstableDropdownMenuLabel>
            {roles?.map(({ id, slug, name }) => (
              <UnstableDropdownMenuCheckboxItem
                key={id}
                checked={filter.roles.includes(slug)}
                onClick={(e) => {
                  e.preventDefault();
                  handleRoleToggle(slug);
                }}
              >
                {name}
              </UnstableDropdownMenuCheckboxItem>
            ))}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </div>
      {!isPending && !data?.identities?.length ? (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {isFiltered
                ? `No ${isSubOrganization ? "sub-" : ""}organization machine identities match search filter`
                : `No machine identities have been added to this ${isSubOrganization ? "sub-" : ""}organization`}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {isFiltered
                ? "Adjust your search or filter criteria."
                : "Add a machine identity to get started."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      ) : (
        <>
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead
                  className="w-1/2 cursor-pointer"
                  onClick={() => handleSort(OrgIdentityOrderBy.Name)}
                >
                  Name
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderBy === OrgIdentityOrderBy.Name &&
                        orderDirection === OrderByDirection.DESC &&
                        "rotate-180",
                      orderBy !== OrgIdentityOrderBy.Name && "opacity-30"
                    )}
                  />
                </UnstableTableHead>
                <UnstableTableHead
                  className="cursor-pointer"
                  onClick={() => handleSort(OrgIdentityOrderBy.Role)}
                >
                  {isSubOrganization ? "Sub-" : ""}Organization Role
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderBy === OrgIdentityOrderBy.Role &&
                        orderDirection === OrderByDirection.DESC &&
                        "rotate-180",
                      orderBy !== OrgIdentityOrderBy.Role && "opacity-30"
                    )}
                  />
                </UnstableTableHead>
                {isSubOrganization && <UnstableTableHead>Managed By</UnstableTableHead>}
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {isPending &&
                Array.from({ length: perPage }).map((_, i) => (
                  <UnstableTableRow key={`skeleton-${i + 1}`}>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-full" />
                    </UnstableTableCell>
                    {isSubOrganization && (
                      <UnstableTableCell>
                        <Skeleton className="h-4 w-full" />
                      </UnstableTableCell>
                    )}
                    <UnstableTableCell>
                      <Skeleton className="h-4 w-4" />
                    </UnstableTableCell>
                  </UnstableTableRow>
                ))}
              {!isPending &&
                data?.identities?.map(
                  ({
                    identity: { id, name, orgId },
                    role,
                    customRole,
                    lastLoginAuthMethod,
                    lastLoginTime
                  }) => {
                    const isSubOrgIdentity = currentOrg.id === orgId;

                    return (
                      <UnstableTableRow
                        key={`identity-${id}`}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate({
                            to: "/organizations/$orgId/identities/$identityId",
                            params: {
                              identityId: id,
                              orgId: currentOrg.id
                            }
                          })
                        }
                      >
                        <UnstableTableCell isTruncatable className="group">
                          {name}
                          {lastLoginAuthMethod && lastLoginTime && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon className="ml-2 inline size-3.5 text-mineshaft-400 opacity-0 transition-all group-hover:opacity-100" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-96 min-w-52">
                                <LastLoginSection
                                  lastLoginAuthMethod={identityAuthToNameMap[lastLoginAuthMethod]}
                                  lastLoginTime={lastLoginTime}
                                />
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </UnstableTableCell>
                        <UnstableTableCell>
                          <OrgPermissionCan
                            I={OrgPermissionIdentityActions.Edit}
                            a={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) => (
                              <Select
                                value={role === "custom" ? (customRole?.slug as string) : role}
                                disabled={!isAllowed}
                                onValueChange={(selectedRole) =>
                                  handleChangeRole({
                                    identityId: id,
                                    role: selectedRole
                                  })
                                }
                              >
                                <SelectTrigger
                                  className="w-full max-w-32 lg:max-w-64"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="max-w-32 lg:max-w-64">
                                  {(roles || []).map(({ slug, name: roleName }) => (
                                    <SelectItem value={slug} key={`owner-option-${slug}`}>
                                      {roleName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </OrgPermissionCan>
                        </UnstableTableCell>
                        {isSubOrganization && (
                          <UnstableTableCell>
                            <Badge variant={isSubOrgIdentity ? "sub-org" : "org"}>
                              {isSubOrgIdentity ? (
                                <>
                                  <SubOrgIcon />
                                  Sub-Organization
                                </>
                              ) : (
                                <>
                                  <OrgIcon />
                                  Root Organization
                                </>
                              )}
                            </Badge>
                          </UnstableTableCell>
                        )}
                        <UnstableTableCell>
                          <UnstableDropdownMenu>
                            <UnstableDropdownMenuTrigger asChild>
                              <UnstableIconButton
                                variant="ghost"
                                size="xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon />
                              </UnstableIconButton>
                            </UnstableDropdownMenuTrigger>
                            <UnstableDropdownMenuContent align="end">
                              <OrgPermissionCan
                                I={OrgPermissionIdentityActions.Edit}
                                a={OrgPermissionSubjects.Identity}
                              >
                                {(isAllowed) => (
                                  <UnstableDropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate({
                                        to: "/organizations/$orgId/identities/$identityId",
                                        params: {
                                          identityId: id,
                                          orgId
                                        }
                                      });
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    <EditIcon />
                                    Edit Machine Identity {isSubOrgIdentity ? "" : "Membership"}
                                  </UnstableDropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                              <OrgPermissionCan
                                I={OrgPermissionIdentityActions.Delete}
                                a={OrgPermissionSubjects.Identity}
                              >
                                {(isAllowed) => (
                                  <UnstableDropdownMenuItem
                                    variant="danger"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("deleteIdentity", {
                                        identityId: id,
                                        name
                                      });
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    <TrashIcon />
                                    {isSubOrgIdentity
                                      ? "Delete Machine Identity"
                                      : "Remove From Sub-Organization"}
                                  </UnstableDropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </UnstableDropdownMenuContent>
                          </UnstableDropdownMenu>
                        </UnstableTableCell>
                      </UnstableTableRow>
                    );
                  }
                )}
            </UnstableTableBody>
          </UnstableTable>
          {totalCount > 0 && (
            <UnstablePagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={handlePerPageChange}
            />
          )}
        </>
      )}
    </>
  );
};
