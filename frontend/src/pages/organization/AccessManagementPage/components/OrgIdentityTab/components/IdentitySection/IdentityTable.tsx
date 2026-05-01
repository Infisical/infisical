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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OrgIcon,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  SubOrgIcon,
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
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { isCustomOrgRole } from "@app/helpers/roles";
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
    popUpName: keyof UsePopUpState<["deleteIdentity", "upgradePlan"]>,
    data?: {
      identityId?: string;
      name?: string;
      text?: string;
      isEnterpriseFeature?: boolean;
    }
  ) => void;
};

type Filter = {
  roles: string[];
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();

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
    if (isCustomOrgRole(role) && subscription && !subscription?.rbac) {
      handlePopUpOpen("upgradePlan", {
        text: "Assigning custom roles to machine identities can be unlocked if you upgrade to Infisical Enterprise plan.",
        isEnterpriseFeature: true
      });
      return;
    }

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant={
                // eslint-disable-next-line no-nested-ternary
                isTableFiltered ? (isSubOrganization ? "sub-org" : "org") : "outline"
              }
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>
              Filter by {isSubOrganization ? "Sub-" : ""}Organization Role
            </DropdownMenuLabel>
            {roles?.map(({ id, slug, name }) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={filter.roles.includes(slug)}
                onClick={(e) => {
                  e.preventDefault();
                  handleRoleToggle(slug);
                }}
              >
                {name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!isPending && !data?.identities?.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {isFiltered
                ? `No ${isSubOrganization ? "sub-" : ""}organization machine identities match search filter`
                : `No machine identities have been added to this ${isSubOrganization ? "sub-" : ""}organization`}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered
                ? "Adjust your search or filter criteria."
                : "Add a machine identity to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
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
                </TableHead>
                <TableHead
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
                </TableHead>
                {isSubOrganization && <TableHead>Managed By</TableHead>}
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: perPage }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    {isSubOrganization && (
                      <TableCell>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    )}
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
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
                      <TableRow
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
                        <TableCell isTruncatable className="group">
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
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        {isSubOrganization && (
                          <TableCell>
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
                          </TableCell>
                        )}
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <OrgPermissionCan
                                I={OrgPermissionIdentityActions.Edit}
                                a={OrgPermissionSubjects.Identity}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
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
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                              <OrgPermissionCan
                                I={OrgPermissionIdentityActions.Delete}
                                a={OrgPermissionSubjects.Identity}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
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
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  }
                )}
            </TableBody>
          </Table>
          {totalCount > 0 && (
            <Pagination
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
