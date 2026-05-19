import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDownIcon,
  ClockAlertIcon,
  ClockIcon,
  EditIcon,
  FilterIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

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
  Popover,
  PopoverContent,
  PopoverTrigger,
  ProjectIcon,
  Skeleton,
  SubOrgIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName } from "@app/helpers/roles";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  identityAuthToNameMap,
  useCountOrgIdentityMemberships,
  useGetOrgRoles,
  useSearchOrgIdentityMemberships
} from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { SearchIdentitiesScope } from "@app/hooks/api/identities";
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

type ScopeTab = "all" | "organization" | "project";

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

const TAB_TO_SCOPE: Record<ScopeTab, SearchIdentitiesScope[]> = {
  all: [SearchIdentitiesScope.Organization, SearchIdentitiesScope.Project],
  organization: [SearchIdentitiesScope.Organization],
  project: [SearchIdentitiesScope.Project]
};

const formatLastUsed = (lastLoginTime?: string | null) => {
  if (!lastLoginTime) return "Never";
  const date = new Date(lastLoginTime);
  if (Number.isNaN(date.getTime())) return "Never";
  if (Date.now() - date.getTime() < 60_000) return "Just now";
  return `${formatDistanceToNow(date)} ago`;
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();

  const [scopeTab, setScopeTab] = useState<ScopeTab>("all");

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

  const searchPayload = {
    name: debouncedSearch ? { $contains: debouncedSearch } : undefined,
    role: filter.roles?.length ? { $in: filter.roles } : undefined
  };

  const { data, isPending } = useSearchOrgIdentityMemberships({
    offset,
    limit,
    orderDirection,
    orderBy,
    scope: TAB_TO_SCOPE[scopeTab],
    search: searchPayload
  });

  const { data: scopeCounts } = useCountOrgIdentityMemberships({
    scope: TAB_TO_SCOPE.all,
    search: searchPayload
  });

  const orgScopeCount = scopeCounts?.organization;
  const projectScopeCount = scopeCounts?.project;
  const allScopeCount =
    orgScopeCount === undefined && projectScopeCount === undefined
      ? undefined
      : (orgScopeCount ?? 0) + (projectScopeCount ?? 0);

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
    // Last-used reads more naturally newest-first; other columns start ascending.
    setOrderDirection(
      column === OrgIdentityOrderBy.LastLogin ? OrderByDirection.DESC : OrderByDirection.ASC
    );
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

  const renderTabCount = (count: number | undefined) =>
    count === undefined ? null : (
      <Badge variant="neutral" className="ml-1.5 px-1.5 font-mono text-[10px]">
        {count}
      </Badge>
    );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={scopeTab} onValueChange={(value) => setScopeTab(value as ScopeTab)}>
          <TabsList variant="filled">
            <TabsTrigger value="all">All{renderTabCount(allScopeCount)}</TabsTrigger>
            <TabsTrigger value="organization">
              <span
                className={twMerge(
                  "size-1.5 rounded-full",
                  isSubOrganization ? "bg-sub-org" : "bg-org"
                )}
                aria-hidden
              />
              {isSubOrganization ? "Sub-Organization" : "Organization"}
              {renderTabCount(orgScopeCount)}
            </TabsTrigger>
            <TabsTrigger value="project">
              <span className="size-1.5 rounded-full bg-project" aria-hidden />
              Project
              {renderTabCount(projectScopeCount)}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-1 justify-end gap-2">
          <InputGroup className="max-w-sm flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${isSubOrganization ? "sub-organization " : ""}machine identities by name...`}
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
                  className="w-1/4 cursor-pointer"
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
                <TableHead className="w-1/4">Scope</TableHead>
                <TableHead
                  className="w-1/4 cursor-pointer"
                  onClick={() => handleSort(OrgIdentityOrderBy.Role)}
                >
                  Role
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
                <TableHead
                  className="w-1/4 cursor-pointer"
                  onClick={() => handleSort(OrgIdentityOrderBy.LastLogin)}
                >
                  Last Used
                  <ChevronDownIcon
                    className={twMerge(
                      "transition-transform",
                      orderBy === OrgIdentityOrderBy.LastLogin &&
                        orderDirection === OrderByDirection.DESC &&
                        "rotate-180",
                      orderBy !== OrgIdentityOrderBy.LastLogin && "opacity-30"
                    )}
                  />
                </TableHead>
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
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isPending &&
                data?.identities?.map(
                  ({
                    id: membershipId,
                    scope,
                    project,
                    identity: { id, name, orgId },
                    roles: membershipRoles,
                    lastLoginAuthMethod,
                    lastLoginTime
                  }) => {
                    const isSubOrgIdentity = currentOrg.id === orgId;
                    const isProjectScoped = scope === SearchIdentitiesScope.Project;
                    const lastUsedLabel = formatLastUsed(lastLoginTime);
                    const navigateToIdentity = () => {
                      if (isProjectScoped && project) {
                        navigate({
                          to: `${getProjectBaseURL(project.type)}/identities/$identityId` as const,
                          params: {
                            orgId: currentOrg.id,
                            projectId: project.id,
                            identityId: id
                          }
                        });
                        return;
                      }
                      navigate({
                        to: "/organizations/$orgId/identities/$identityId",
                        params: {
                          identityId: id,
                          orgId: currentOrg.id
                        }
                      });
                    };

                    return (
                      <TableRow
                        key={`identity-${membershipId}`}
                        className="cursor-pointer"
                        onClick={navigateToIdentity}
                      >
                        <TableCell isTruncatable>{name}</TableCell>
                        <TableCell>
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {isProjectScoped ? (
                            <Badge variant="project">
                              <ProjectIcon />
                              {project?.name ?? "Project"}
                            </Badge>
                          ) : isSubOrganization ? (
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
                          ) : (
                            <Badge variant="org">
                              <OrgIcon />
                              Organization
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {(membershipRoles ?? [])
                              .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                              .map(
                                ({
                                  role: roleSlug,
                                  customRoleName,
                                  id: roleId,
                                  isTemporary,
                                  temporaryAccessEndTime
                                }) => {
                                  const isExpired =
                                    isTemporary &&
                                    !!temporaryAccessEndTime &&
                                    new Date() > new Date(temporaryAccessEndTime);
                                  return (
                                    <Badge key={roleId} variant={isExpired ? "danger" : "neutral"}>
                                      <span className="capitalize">
                                        {formatProjectRoleName(
                                          roleSlug,
                                          customRoleName ?? undefined
                                        )}
                                      </span>
                                      {isTemporary && (
                                        <Tooltip>
                                          <TooltipTrigger tabIndex={-1}>
                                            {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {isExpired ? "Access expired" : "Temporary access"}
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </Badge>
                                  );
                                }
                              )}
                            {(membershipRoles?.length ?? 0) > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
                              <Popover>
                                <Tooltip>
                                  <TooltipTrigger className="flex h-4 items-center">
                                    <PopoverTrigger asChild>
                                      <Badge variant="neutral" asChild>
                                        <button type="button" onClick={(e) => e.stopPropagation()}>
                                          +
                                          {(membershipRoles?.length ?? 0) -
                                            MAX_ROLES_TO_BE_SHOWN_IN_TABLE}
                                        </button>
                                      </Badge>
                                    </PopoverTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent>Click to view additional roles</TooltipContent>
                                </Tooltip>
                                <PopoverContent
                                  side="right"
                                  className="flex w-auto max-w-sm flex-wrap gap-1.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {(membershipRoles ?? [])
                                    .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
                                    .map(
                                      ({
                                        role: roleSlug,
                                        customRoleName,
                                        id: roleId,
                                        isTemporary,
                                        temporaryAccessEndTime
                                      }) => {
                                        const isExpired =
                                          isTemporary &&
                                          !!temporaryAccessEndTime &&
                                          new Date() > new Date(temporaryAccessEndTime);
                                        return (
                                          <Badge
                                            key={roleId}
                                            className="z-10"
                                            variant={isExpired ? "danger" : "neutral"}
                                          >
                                            <span className="capitalize">
                                              {formatProjectRoleName(
                                                roleSlug,
                                                customRoleName ?? undefined
                                              )}
                                            </span>
                                            {isTemporary && (
                                              <Tooltip>
                                                <TooltipTrigger tabIndex={-1}>
                                                  {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  {isExpired
                                                    ? "Access expired"
                                                    : "Temporary access"}
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                          </Badge>
                                        );
                                      }
                                    )}
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {lastLoginAuthMethod && lastLoginTime ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default text-sm text-foreground/80">
                                  {lastUsedLabel}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-96 min-w-52">
                                <LastLoginSection
                                  lastLoginAuthMethod={identityAuthToNameMap[lastLoginAuthMethod]}
                                  lastLoginTime={lastLoginTime}
                                />
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-sm text-mineshaft-400">{lastUsedLabel}</span>
                          )}
                        </TableCell>
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
                                      navigateToIdentity();
                                    }}
                                    isDisabled={!isAllowed}
                                  >
                                    <EditIcon />
                                    {isProjectScoped
                                      ? "Open in Project"
                                      : `Edit Machine Identity ${isSubOrgIdentity ? "" : "Membership"}`}
                                  </DropdownMenuItem>
                                )}
                              </OrgPermissionCan>
                              {!isProjectScoped && (
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
                              )}
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
