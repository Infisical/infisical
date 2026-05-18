import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDownIcon,
  EditIcon,
  FilterIcon,
  MoreHorizontalIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { LastLoginSection } from "@app/components/organization/LastLoginSection";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
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
  useOrgPermission,
  useSubscription
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { formatProjectRoleName, isCustomOrgRole, OrgMembershipRole } from "@app/helpers/roles";
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
import { IdentityScope } from "@app/hooks/api/identities/types";
import { OrgIdentityOrderBy } from "@app/hooks/api/organization/types";
import { ProjectType } from "@app/hooks/api/projects/types";
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

type ScopeMode = "organization" | "all";

type IdentityRoleEntry = {
  id: string;
  role: string;
  customRoleSlug: string | null;
};

const MAX_VISIBLE_ROLES = 2;

const formatRoleLabel = (entry: IdentityRoleEntry, rolesIndex: Map<string, string>): string => {
  if (entry.role === "custom" && entry.customRoleSlug) {
    return rolesIndex.get(entry.customRoleSlug) ?? entry.customRoleSlug;
  }
  return formatProjectRoleName(entry.role);
};

type RoleBadgesProps = {
  roles: IdentityRoleEntry[];
  allRoles?: { slug: string; name: string }[];
};

const RoleBadges = ({ roles, allRoles }: RoleBadgesProps) => {
  const rolesIndex = new Map<string, string>(
    (allRoles ?? []).map(({ slug, name }) => [slug, name])
  );

  if (!roles.length) {
    return <span className="text-mineshaft-500">—</span>;
  }

  const visible = roles.slice(0, MAX_VISIBLE_ROLES);
  const overflow = roles.slice(MAX_VISIBLE_ROLES);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((entry) => (
        <Badge key={entry.id} variant="neutral">
          {formatRoleLabel(entry, rolesIndex)}
        </Badge>
      ))}
      {overflow.length > 0 && (
        <Popover>
          <Tooltip>
            <TooltipTrigger className="flex h-4 items-center">
              <PopoverTrigger asChild>
                <Badge variant="neutral" asChild>
                  <button type="button" onClick={(e) => e.stopPropagation()}>
                    +{overflow.length}
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
            {overflow.map((entry) => (
              <Badge key={entry.id} variant="neutral">
                {formatRoleLabel(entry, rolesIndex)}
              </Badge>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

const formatLastUsed = (lastLoginTime?: string) => {
  if (!lastLoginTime) return "Never";
  const date = new Date(lastLoginTime);
  if (Number.isNaN(date.getTime())) return "Never";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  return `${formatDistanceToNow(date)} ago`;
};

const getScopeBadge = ({
  project,
  isProjectIdentity,
  isSubOrganization,
  isSubOrgIdentity
}: {
  project: { id: string; name: string; type: string } | null | undefined;
  isProjectIdentity: boolean;
  isSubOrganization: boolean;
  isSubOrgIdentity: boolean;
}): { variant: "project" | "sub-org" | "org"; icon: JSX.Element; label: string } => {
  if (isProjectIdentity && project) {
    return { variant: "project", icon: <ProjectIcon />, label: project.name };
  }

  if (isSubOrganization && isSubOrgIdentity) {
    return { variant: "sub-org", icon: <SubOrgIcon />, label: "Sub-Organization" };
  }

  if (isSubOrganization) {
    return { variant: "org", icon: <OrgIcon />, label: "Root Organization" };
  }

  return { variant: "org", icon: <OrgIcon />, label: "Organization" };
};

const renderScopeIconBadge = (args: {
  project: { id: string; name: string; type: string } | null | undefined;
  isProjectIdentity: boolean;
  isSubOrganization: boolean;
  isSubOrgIdentity: boolean;
}) => {
  const { variant, icon, label } = getScopeBadge(args);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Badge variant={variant} isSquare>
            {icon}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <Badge variant={variant} className="relative z-[80]">
          {icon}
          {label}
        </Badge>
      </TooltipContent>
    </Tooltip>
  );
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();
  const { hasOrgRole } = useOrgPermission();
  const isOrgAdmin = hasOrgRole(OrgMembershipRole.Admin);

  const [scopeMode, setScopeMode] = useState<ScopeMode>("organization");
  const showAllScope = isOrgAdmin && scopeMode === "all";

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
    scopes: showAllScope
      ? [IdentityScope.Organization, IdentityScope.Project]
      : [IdentityScope.Organization],
    search: {
      name: debouncedSearch ? { $contains: debouncedSearch } : undefined,
      role: filter.roles?.length ? { $in: filter.roles } : undefined
    }
  });

  const { totalCount = 0, orgCount, projectCount } = data ?? {};
  const hasScopeCounts = orgCount !== undefined && projectCount !== undefined;
  const showScopeColumn = showAllScope || isSubOrganization;
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

  const getEmptyTitle = () => {
    if (isFiltered) {
      if (showAllScope) {
        return "No machine identities match search filter";
      }
      const subPrefix = isSubOrganization ? "sub-" : "";
      return `No ${subPrefix}organization machine identities match search filter`;
    }
    if (showAllScope) {
      return "No machine identities have been added to this organization or its projects";
    }
    const subPrefix = isSubOrganization ? "sub-" : "";
    return `No machine identities have been added to this ${subPrefix}organization`;
  };

  return (
    <>
      {showAllScope && (
        <div className="mb-3 flex items-center justify-between gap-4 rounded-md border border-mineshaft-600 bg-mineshaft-800 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-mineshaft-300">
            <ShieldIcon className="size-4 text-mineshaft-400" />
            <span>
              <span className="font-semibold text-mineshaft-100">Admin view.</span> View every
              machine identity across this organization and its projects.
            </span>
          </div>
          {hasScopeCounts && (
            <div className="flex items-center gap-3 text-xs text-mineshaft-400">
              <span>
                <span className="font-semibold text-mineshaft-200">{orgCount}</span> organization
              </span>
              <span className="text-mineshaft-600">|</span>
              <span>
                <span className="font-semibold text-mineshaft-200">{projectCount}</span> project
              </span>
              <span className="text-mineshaft-600">|</span>
              <span>
                <span className="font-semibold text-mineshaft-200">
                  {(orgCount ?? 0) + (projectCount ?? 0)}
                </span>{" "}
                total
              </span>
            </div>
          )}
        </div>
      )}
      <div className="mb-4 flex gap-2">
        {isOrgAdmin && (
          <div
            role="group"
            aria-label="Identity scope"
            className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1"
          >
            <Button
              variant="ghost"
              size="xs"
              aria-pressed={scopeMode === "organization"}
              onClick={() => {
                setScopeMode("organization");
                setPage(1);
              }}
              className={twMerge(
                "min-w-20 rounded border-none hover:bg-mineshaft-600",
                scopeMode === "organization" ? "bg-mineshaft-500" : "bg-transparent"
              )}
            >
              Organization
            </Button>
            <Button
              variant="ghost"
              size="xs"
              aria-pressed={scopeMode === "all"}
              onClick={() => {
                setScopeMode("all");
                setPage(1);
              }}
              className={twMerge(
                "min-w-20 rounded border-none hover:bg-mineshaft-600",
                scopeMode === "all" ? "bg-mineshaft-500" : "bg-transparent"
              )}
            >
              All
            </Button>
          </div>
        )}
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              showAllScope
                ? "Search across all machine identities..."
                : `Search ${isSubOrganization ? "sub-organization" : "organization"} machine identities by name...`
            }
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
            <EmptyTitle>{getEmptyTitle()}</EmptyTitle>
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
                {showScopeColumn && <TableHead className="w-5" />}
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
                  {showAllScope ? "Roles" : `${isSubOrganization ? "Sub-" : ""}Organization Role`}
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
                {showAllScope && (
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSort(OrgIdentityOrderBy.LastUsed)}
                  >
                    Last Used
                    <ChevronDownIcon
                      className={twMerge(
                        "transition-transform",
                        orderBy === OrgIdentityOrderBy.LastUsed &&
                          orderDirection === OrderByDirection.DESC &&
                          "rotate-180",
                        orderBy !== OrgIdentityOrderBy.LastUsed && "opacity-30"
                      )}
                    />
                  </TableHead>
                )}
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: perPage }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    {showScopeColumn && (
                      <TableCell>
                        <Skeleton className="size-4.5" />
                      </TableCell>
                    )}
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    {showAllScope && (
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
                    project,
                    roles: identityRoles,
                    lastLoginAuthMethod,
                    lastLoginTime
                  }) => {
                    const isSubOrgIdentity = currentOrg.id === orgId;
                    const isProjectIdentity = Boolean(project);
                    const projectIdentityRoute = project
                      ? (`${getProjectBaseURL(project.type as ProjectType)}/identities/$identityId` as const)
                      : null;

                    return (
                      <TableRow
                        key={`identity-${id}`}
                        className="cursor-pointer"
                        onClick={() => {
                          if (project && projectIdentityRoute) {
                            navigate({
                              to: projectIdentityRoute,
                              params: {
                                identityId: id,
                                orgId: currentOrg.id,
                                projectId: project.id
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
                        }}
                      >
                        {showScopeColumn && (
                          <TableCell>
                            {renderScopeIconBadge({
                              project,
                              isProjectIdentity,
                              isSubOrganization,
                              isSubOrgIdentity
                            })}
                          </TableCell>
                        )}
                        <TableCell isTruncatable>{name}</TableCell>
                        <TableCell>
                          {showAllScope ? (
                            <RoleBadges roles={identityRoles ?? []} allRoles={roles} />
                          ) : (
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
                          )}
                        </TableCell>
                        {showAllScope && (
                          <TableCell className="whitespace-nowrap text-mineshaft-300">
                            {lastLoginTime ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>{formatLastUsed(lastLoginTime)}</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-96 min-w-52 px-3">
                                  <LastLoginSection
                                    lastLoginAuthMethod={
                                      lastLoginAuthMethod
                                        ? identityAuthToNameMap[lastLoginAuthMethod]
                                        : "—"
                                    }
                                    lastLoginTime={lastLoginTime}
                                  />
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-mineshaft-500">Never</span>
                            )}
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
                              {isProjectIdentity && project && projectIdentityRoute ? (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate({
                                      to: projectIdentityRoute,
                                      params: {
                                        identityId: id,
                                        orgId: currentOrg.id,
                                        projectId: project.id
                                      }
                                    });
                                  }}
                                >
                                  <EditIcon />
                                  Open in Project
                                </DropdownMenuItem>
                              ) : (
                                <>
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
                                </>
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
