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
import {
  IdentityMembershipSearchResult,
  IdentityMembershipSearchRole,
  SearchIdentitiesScope
} from "@app/hooks/api/identities";
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
  all: [SearchIdentitiesScope.OrganizationScope, SearchIdentitiesScope.ProjectScope],
  organization: [SearchIdentitiesScope.OrganizationScope],
  project: [SearchIdentitiesScope.ProjectScope]
};

const formatLastUsed = (lastLoginTime?: string | null) => {
  if (!lastLoginTime) return "Never";
  const date = new Date(lastLoginTime);
  if (Number.isNaN(date.getTime())) return "Never";
  if (Date.now() - date.getTime() < 60_000) return "Just now";
  return `${formatDistanceToNow(date)} ago`;
};

const isRoleExpired = (role: IdentityMembershipSearchRole) =>
  role.isTemporary &&
  !!role.temporaryAccessEndTime &&
  new Date() > new Date(role.temporaryAccessEndTime);

type SortableHeadProps = {
  column: OrgIdentityOrderBy;
  label: string;
  activeColumn: OrgIdentityOrderBy;
  direction: OrderByDirection;
  onSort: (column: OrgIdentityOrderBy) => void;
};

const SortableHead = ({ column, label, activeColumn, direction, onSort }: SortableHeadProps) => {
  const isActive = activeColumn === column;
  return (
    <TableHead className="w-1/4 cursor-pointer" onClick={() => onSort(column)}>
      {label}
      <ChevronDownIcon
        className={twMerge(
          "transition-transform",
          isActive && direction === OrderByDirection.DESC && "rotate-180",
          !isActive && "opacity-30"
        )}
      />
    </TableHead>
  );
};

const RoleBadge = ({
  role,
  className
}: {
  role: IdentityMembershipSearchRole;
  className?: string;
}) => {
  const expired = isRoleExpired(role);
  return (
    <Badge variant={expired ? "danger" : "neutral"} className={className}>
      <span className="capitalize">
        {formatProjectRoleName(role.role, role.customRoleName ?? undefined)}
      </span>
      {role.isTemporary && (
        <Tooltip>
          <TooltipTrigger tabIndex={-1}>
            {expired ? <ClockAlertIcon /> : <ClockIcon />}
          </TooltipTrigger>
          <TooltipContent>{expired ? "Access expired" : "Temporary access"}</TooltipContent>
        </Tooltip>
      )}
    </Badge>
  );
};

const RolesCell = ({ roles }: { roles: IdentityMembershipSearchRole[] }) => {
  const visible = roles.slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE);
  const overflow = roles.slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE);

  return (
    <div className="flex items-center gap-1.5">
      {visible.map((role) => (
        <RoleBadge key={role.id} role={role} />
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
            {overflow.map((role) => (
              <RoleBadge key={role.id} role={role} className="z-10" />
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

type ManagedByCellProps = {
  scope: SearchIdentitiesScope;
  project?: IdentityMembershipSearchResult["project"];
  isSubOrganization: boolean;
  isSubOrgIdentity: boolean;
};

const ManagedByCell = ({
  scope,
  project,
  isSubOrganization,
  isSubOrgIdentity
}: ManagedByCellProps) => {
  if (scope === SearchIdentitiesScope.ProjectScope) {
    return (
      <Badge variant="project">
        <ProjectIcon />
        {project?.name ?? "Project"}
      </Badge>
    );
  }

  if (isSubOrganization && isSubOrgIdentity) {
    return (
      <Badge variant="sub-org">
        <SubOrgIcon />
        Sub-Organization
      </Badge>
    );
  }

  if (isSubOrganization) {
    return (
      <Badge variant="org">
        <OrgIcon />
        Root Organization
      </Badge>
    );
  }

  return (
    <Badge variant="org">
      <OrgIcon />
      Organization
    </Badge>
  );
};

type LastUsedCellProps = Pick<
  IdentityMembershipSearchResult,
  "lastLoginAuthMethod" | "lastLoginTime"
>;

const LastUsedCell = ({ lastLoginAuthMethod, lastLoginTime }: LastUsedCellProps) => {
  const label = formatLastUsed(lastLoginTime);

  if (!lastLoginAuthMethod || !lastLoginTime) {
    return <span className="text-sm text-mineshaft-400">{label}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default text-sm text-foreground/80">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-96 min-w-52">
        <LastLoginSection
          lastLoginAuthMethod={identityAuthToNameMap[lastLoginAuthMethod]}
          lastLoginTime={lastLoginTime}
        />
      </TooltipContent>
    </Tooltip>
  );
};

type IdentityActionsMenuProps = {
  isProjectScoped: boolean;
  isSubOrgIdentity: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

const getEditLabel = ({ isProjectScoped, isSubOrgIdentity }: IdentityActionsMenuProps) => {
  if (isProjectScoped) return "Open in Project";
  if (isSubOrgIdentity) return "Edit Machine Identity";
  return "Edit Machine Identity Membership";
};

const IdentityActionsMenu = (props: IdentityActionsMenuProps) => {
  const { isProjectScoped, isSubOrgIdentity, onEdit, onDelete } = props;
  const deleteLabel = isSubOrgIdentity ? "Delete Machine Identity" : "Remove From Sub-Organization";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontalIcon />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isProjectScoped ? (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <EditIcon />
            {getEditLabel(props)}
          </DropdownMenuItem>
        ) : (
          <OrgPermissionCan
            I={OrgPermissionIdentityActions.Edit}
            a={OrgPermissionSubjects.Identity}
          >
            {(isAllowed) => (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                isDisabled={!isAllowed}
              >
                <EditIcon />
                {getEditLabel(props)}
              </DropdownMenuItem>
            )}
          </OrgPermissionCan>
        )}
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
                  onDelete();
                }}
                isDisabled={!isAllowed}
              >
                <TrashIcon />
                {deleteLabel}
              </DropdownMenuItem>
            )}
          </OrgPermissionCan>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const SkeletonRow = () => (
  <TableRow>
    <TableCell>
      <Skeleton className="h-4 w-full" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-full" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-24" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-20" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-4" />
    </TableCell>
  </TableRow>
);

type IdentityRowProps = {
  membership: IdentityMembershipSearchResult;
  onDelete: (data: { identityId: string; name: string }) => void;
};

const IdentityRow = ({ membership, onDelete }: IdentityRowProps) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();

  const {
    scope,
    project,
    identity: { id, name, orgId },
    roles: membershipRoles,
    lastLoginAuthMethod,
    lastLoginTime
  } = membership;

  const isSubOrgIdentity = currentOrg.id === orgId;
  const isProjectScoped = scope === SearchIdentitiesScope.ProjectScope;

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
      params: { identityId: id, orgId: currentOrg.id }
    });
  };

  return (
    <TableRow className="cursor-pointer" onClick={navigateToIdentity}>
      <TableCell isTruncatable>{name}</TableCell>
      <TableCell>
        <RolesCell roles={membershipRoles ?? []} />
      </TableCell>
      <TableCell>
        <ManagedByCell
          scope={scope}
          project={project}
          isSubOrganization={isSubOrganization}
          isSubOrgIdentity={isSubOrgIdentity}
        />
      </TableCell>
      <TableCell>
        <LastUsedCell lastLoginAuthMethod={lastLoginAuthMethod} lastLoginTime={lastLoginTime} />
      </TableCell>
      <TableCell>
        <IdentityActionsMenu
          isProjectScoped={isProjectScoped}
          isSubOrgIdentity={isSubOrgIdentity}
          onEdit={navigateToIdentity}
          onDelete={() => onDelete({ identityId: id, name })}
        />
      </TableCell>
    </TableRow>
  );
};

const renderTabCount = (count: number | undefined) =>
  count === undefined ? null : (
    <span className="ml-1.5 self-end pb-[3px] text-xs leading-none text-muted tabular-nums">
      {count}
    </span>
  );

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();

  const [scopeTab, setScopeTab] = useState<ScopeTab>("organization");

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

  const [filter, setFilter] = useState<Filter>({ roles: [] });

  const organizationId = currentOrg?.id || "";

  const searchPayload = {
    name: debouncedSearch ? { $contains: debouncedSearch } : undefined,
    role: filter.roles?.length ? { $in: filter.roles } : undefined
  };

  const { data, isPending } = useSearchOrgIdentityMemberships({
    orgId: organizationId,
    offset,
    limit,
    orderDirection,
    orderBy,
    scope: TAB_TO_SCOPE[scopeTab],
    search: searchPayload
  });

  const { data: scopeCounts } = useCountOrgIdentityMemberships({
    orgId: organizationId,
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
  useResetPageHelper({ totalCount, offset, setPage });

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
        return {
          ...state,
          roles: currentRoles.includes(roleSlug)
            ? currentRoles.filter((role) => role !== roleSlug)
            : [...currentRoles, roleSlug]
        };
      }),
    []
  );

  const isTableFiltered = filter.roles.length > 0;
  const isFiltered = debouncedSearch.trim().length > 0 || isTableFiltered;
  const isEmpty = !isPending && !data?.identities?.length;

  const orgWord = isSubOrganization ? "sub-organization" : "organization";
  const orgVariant = isSubOrganization ? "sub-org" : "org";
  const isProjectTab = scopeTab === "project";
  const scopeLabel = isProjectTab ? "project" : orgWord;

  let emptyTitle: string;
  let emptyDescription: string;
  if (isFiltered) {
    emptyTitle =
      scopeTab === "all"
        ? "No machine identities match search filter"
        : `No ${scopeLabel} machine identities match search filter`;
    emptyDescription = "Adjust your search or filter criteria.";
  } else if (isProjectTab) {
    emptyTitle = "No project machine identities found";
    emptyDescription = "Machine identities scoped to a project will appear here.";
  } else {
    emptyTitle = `No machine identities have been added to this ${orgWord}`;
    emptyDescription = "Add a machine identity to get started.";
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={scopeTab} onValueChange={(value) => setScopeTab(value as ScopeTab)}>
          <TabsList variant="filled">
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
            <TabsTrigger value="all">All{renderTabCount(allScopeCount)}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex w-1/2 justify-end gap-2">
          <InputGroup className="flex-1">
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
              <IconButton variant={isTableFiltered ? orgVariant : "outline"}>
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
      {isEmpty ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  column={OrgIdentityOrderBy.Name}
                  label="Name"
                  activeColumn={orderBy}
                  direction={orderDirection}
                  onSort={handleSort}
                />
                <SortableHead
                  column={OrgIdentityOrderBy.Role}
                  label="Role"
                  activeColumn={orderBy}
                  direction={orderDirection}
                  onSort={handleSort}
                />
                <TableHead className="w-1/4">Managed by</TableHead>
                <SortableHead
                  column={OrgIdentityOrderBy.LastLogin}
                  label="Last Used"
                  activeColumn={orderBy}
                  direction={orderDirection}
                  onSort={handleSort}
                />
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: perPage }).map((_, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <SkeletonRow key={`skeleton-${i}`} />
                ))}
              {!isPending &&
                data?.identities?.map((membership) => (
                  <IdentityRow
                    key={`identity-${membership.id}`}
                    membership={membership}
                    onDelete={(payload) => handlePopUpOpen("deleteIdentity", payload)}
                  />
                ))}
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
