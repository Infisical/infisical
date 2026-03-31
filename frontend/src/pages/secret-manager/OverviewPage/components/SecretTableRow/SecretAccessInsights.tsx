import { useMemo, useRef, useState } from "react";
import { subject } from "@casl/ability";
import { Link } from "@tanstack/react-router";
import {
  BanIcon,
  CheckIcon,
  ExternalLinkIcon,
  FilterIcon,
  HardDriveIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import {
  EmptyMedia,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  PermissionConditionOperators,
  ProjectPermissionSecretActions
} from "@app/context/ProjectPermissionContext/types";
import { getProjectBaseURL } from "@app/helpers/project";
import { useGetSecretAccessList } from "@app/hooks/api/secrets/queries";
import { SecretAccessListEntry } from "@app/hooks/api/secrets/types";
import { IdentityProjectAdditionalPrivilegeModifySection } from "@app/pages/project/IdentityDetailsByIDPage/components/IdentityProjectAdditionalPrivilegeSection/IdentityProjectAdditionalPrivilegeModifySection";
import { MembershipProjectAdditionalPrivilegeModifySection } from "@app/pages/project/MemberDetailsByIDPage/components/MemberProjectAdditionalPrivilegeSection/MembershipProjectAdditionalPrivilegeModifySection";

type Props = {
  secretKey: string;
  environment: string;
  secretPath: string;
};

type EditingPrivilege = {
  type: "user" | "identity";
  membershipId: string;
  identityId?: string;
  name: string;
};

type AccessRowType = "user" | "identity" | "group";

type AccessRow = {
  type: AccessRowType;
  entry: SecretAccessListEntry;
  linkTo: string;
  linkParams: Record<string, string>;
  canEdit: boolean;
  onEdit?: () => void;
};

const PERMISSION_COLUMNS = [
  {
    action: ProjectPermissionSecretActions.DescribeAndReadValue,
    label: "Read",
    isLegacy: true
  },
  { action: ProjectPermissionSecretActions.DescribeSecret, label: "Describe", isLegacy: false },
  { action: ProjectPermissionSecretActions.ReadValue, label: "Read Value", isLegacy: false },
  { action: ProjectPermissionSecretActions.Create, label: "Create", isLegacy: false },
  { action: ProjectPermissionSecretActions.Edit, label: "Edit", isLegacy: false },
  { action: ProjectPermissionSecretActions.Delete, label: "Delete", isLegacy: false }
] as const;

const TYPE_CONFIG: Record<AccessRowType, { icon: typeof UserIcon; label: string }> = {
  user: { icon: UserIcon, label: "User" },
  identity: { icon: HardDriveIcon, label: "Machine Identity" },
  group: { icon: UsersIcon, label: "Group" }
};

const ALL_TYPE_FILTERS: AccessRowType[] = ["user", "identity", "group"];

export function SecretAccessInsights({ secretKey, environment, secretPath }: Props) {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const [editingPrivilege, setEditingPrivilege] = useState<EditingPrivilege | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<AccessRowType>>(() => new Set());
  const [showAllEntities, setShowAllEntities] = useState(false);

  const toggleTypeFilter = (type: AccessRowType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const initialPermissions = useMemo(
    () => ({
      [ProjectPermissionSub.Secrets]: [
        {
          conditions: [
            {
              operator: PermissionConditionOperators.$EQ,
              lhs: "environment",
              rhs: environment
            },
            {
              operator: PermissionConditionOperators.$EQ,
              lhs: "secretPath",
              rhs: secretPath
            },
            {
              operator: PermissionConditionOperators.$EQ,
              lhs: "secretName",
              rhs: secretKey
            }
          ]
        }
      ]
    }),
    [environment, secretPath, secretKey]
  );

  const { data: secretAccessList, isLoading } = useGetSecretAccessList({
    projectId: currentProject.id,
    environment,
    secretPath,
    secretKey,
    includeAllEntities: showAllEntities
  });

  const flatRows = useMemo<AccessRow[]>(() => {
    if (!secretAccessList) return [];
    const baseUrl = getProjectBaseURL(currentProject.type);

    return [
      ...secretAccessList.users.map(
        (user): AccessRow => ({
          type: "user",
          entry: user,
          linkTo: `${baseUrl}/members/$membershipId`,
          linkParams: {
            orgId: currentOrg.id,
            projectId: currentProject.id,
            membershipId: user.membershipId
          },
          canEdit: permission.can(
            ProjectPermissionMemberActions.AssignAdditionalPrivileges,
            subject(ProjectPermissionSub.Member, { userEmail: user.name })
          ),
          onEdit: () =>
            setEditingPrivilege({
              type: "user",
              membershipId: user.membershipId,
              name: user.name
            })
        })
      ),
      ...secretAccessList.identities.map(
        (identity): AccessRow => ({
          type: "identity",
          entry: identity,
          linkTo: `${baseUrl}/identities/$identityId`,
          linkParams: {
            orgId: currentOrg.id,
            projectId: currentProject.id,
            identityId: identity.id
          },
          canEdit: permission.can(
            ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
            subject(ProjectPermissionSub.Identity, { identityId: identity.id })
          ),
          onEdit: () =>
            setEditingPrivilege({
              type: "identity",
              membershipId: identity.membershipId,
              identityId: identity.id,
              name: identity.name
            })
        })
      ),
      ...secretAccessList.groups.map(
        (group): AccessRow => ({
          type: "group",
          entry: group,
          linkTo: `${baseUrl}/groups/$groupId`,
          linkParams: {
            orgId: currentOrg.id,
            projectId: currentProject.id,
            groupId: group.id
          },
          canEdit: false
        })
      )
    ];
  }, [secretAccessList, permission, currentOrg.id, currentProject, setEditingPrivilege]);

  const hasLegacyRead = useMemo(
    () =>
      flatRows.some((row) =>
        row.entry.allowedActions.includes(ProjectPermissionSecretActions.DescribeAndReadValue)
      ),
    [flatRows]
  );

  const filteredRows = useMemo(
    () =>
      flatRows.filter(
        (row) =>
          (typeFilters.size === 0 || typeFilters.has(row.type)) &&
          row.entry.name.toLowerCase().includes(searchFilter.trim().toLowerCase())
      ),
    [flatRows, searchFilter, typeFilters]
  );

  const visibleColumns = useMemo(
    () => PERMISSION_COLUMNS.filter((col) => !col.isLegacy || hasLegacyRead),
    [hasLegacyRead]
  );

  const isFilterActive = typeFilters.size > 0;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-9 w-full rounded-md" />
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead>Type</UnstableTableHead>
              <UnstableTableHead>Name</UnstableTableHead>
              {PERMISSION_COLUMNS.filter((col) => !col.isLegacy).map((col) => (
                <UnstableTableHead key={col.action} className="w-[100px] text-center">
                  {col.label}
                </UnstableTableHead>
              ))}
              <UnstableTableHead className="w-10" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <UnstableTableRow key={`skeleton-row-${String(i)}`}>
                <UnstableTableCell>
                  <Skeleton className="h-4 w-16 rounded" />
                </UnstableTableCell>
                <UnstableTableCell>
                  <Skeleton className="h-4 w-24 rounded" />
                </UnstableTableCell>
                {PERMISSION_COLUMNS.filter((col) => !col.isLegacy).map((col) => (
                  <UnstableTableCell key={col.action} className="w-[100px] text-center">
                    <Skeleton className="mx-auto h-4 w-4 rounded" />
                  </UnstableTableCell>
                ))}
                <UnstableTableCell>
                  <Skeleton className="h-4 w-6 rounded" />
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
          </UnstableTableBody>
        </UnstableTable>
      </div>
    );
  }

  const hasAnyAccess =
    secretAccessList &&
    (secretAccessList.users.length > 0 ||
      secretAccessList.identities.length > 0 ||
      secretAccessList.groups.length > 0);

  if (!hasAnyAccess) {
    return (
      <UnstableEmpty className="bg-transparent">
        <UnstableEmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <UnstableEmptyTitle>No Access Found</UnstableEmptyTitle>
          <UnstableEmptyDescription>
            No users, groups, or identities have direct access to this secret.
          </UnstableEmptyDescription>
        </UnstableEmptyHeader>
      </UnstableEmpty>
    );
  }

  return (
    <>
      <div className="flex thin-scrollbar flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by name..."
            />
          </InputGroup>
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <UnstableIconButton
                variant={isFilterActive ? "project" : "outline"}
                size="sm"
                aria-label="Filter by type"
              >
                <FilterIcon />
              </UnstableIconButton>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="end">
              {ALL_TYPE_FILTERS.map((type) => {
                const { icon: TypeIcon, label } = TYPE_CONFIG[type];
                return (
                  <UnstableDropdownMenuCheckboxItem
                    key={type}
                    checked={typeFilters.has(type)}
                    onCheckedChange={() => toggleTypeFilter(type)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <TypeIcon className="size-4" />
                    {label}
                  </UnstableDropdownMenuCheckboxItem>
                );
              })}
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
          <Label className="cursor-pointer gap-1.5 text-xs whitespace-nowrap text-muted">
            <Switch
              variant="project"
              checked={showAllEntities}
              onCheckedChange={setShowAllEntities}
            />
            Show all members
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-3.5 text-muted" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-60">
                When enabled, all project members are shown including those without any access to
                this secret.
              </TooltipContent>
            </Tooltip>
          </Label>
        </div>

        {filteredRows.length === 0 ? (
          <UnstableEmpty className="border">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No Results Found</UnstableEmptyTitle>
              <UnstableEmptyDescription>
                No users, groups, or identities match your search.
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        ) : (
          <UnstableTable containerClassName="overflow-auto">
            <UnstableTableHeader className="sticky -top-px z-20 bg-container [&_tr]:border-b-0">
              <UnstableTableRow>
                <UnstableTableHead className="border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
                  Type
                </UnstableTableHead>
                <UnstableTableHead className="border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
                  Name
                </UnstableTableHead>
                {visibleColumns.map((col) => (
                  <UnstableTableHead
                    key={col.action}
                    className="w-[100px] border-b-0 text-center shadow-[inset_0_-1px_0_var(--color-border)]"
                  >
                    {col.isLegacy ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            <TriangleAlertIcon className="size-3.5 text-yellow-500" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          This is a legacy permission. Migrate to Describe and Read Value for
                          finer-grained access control.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      col.label
                    )}
                  </UnstableTableHead>
                ))}
                <UnstableTableHead className="w-10 border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {filteredRows.map((row) => {
                const { icon: TypeIcon, label: typeLabel } = TYPE_CONFIG[row.type];
                return (
                  <UnstableTableRow key={`${row.type}-${row.entry.id}`}>
                    <UnstableTableCell>
                      <span className="flex items-center gap-2">
                        <TypeIcon className="size-4 text-accent" />
                        {typeLabel}
                      </span>
                    </UnstableTableCell>
                    <UnstableTableCell isTruncatable className="max-w-[180px] font-medium">
                      {row.entry.name}
                    </UnstableTableCell>
                    {visibleColumns.map((col) => (
                      <UnstableTableCell key={col.action} className="w-[100px] text-center">
                        {row.entry.allowedActions.includes(col.action) ? (
                          <CheckIcon className="mx-auto size-4 text-success" />
                        ) : (
                          <BanIcon className="mx-auto size-4 text-muted" />
                        )}
                      </UnstableTableCell>
                    ))}
                    <UnstableTableCell className="text-right">
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <UnstableIconButton size="xs" variant="ghost">
                            <MoreHorizontalIcon />
                          </UnstableIconButton>
                        </UnstableDropdownMenuTrigger>
                        <UnstableDropdownMenuContent align="end">
                          {row.onEdit && (
                            <Tooltip open={row.canEdit ? false : undefined}>
                              <TooltipTrigger>
                                <UnstableDropdownMenuItem
                                  isDisabled={!row.canEdit}
                                  onClick={() => row.onEdit?.()}
                                >
                                  <PlusIcon />
                                  Add Additional Privilege
                                </UnstableDropdownMenuItem>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                You do not have permission to perform this action
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <UnstableDropdownMenuItem asChild>
                            <Link to={row.linkTo as "."} params={row.linkParams} target="_blank">
                              <ExternalLinkIcon />
                              Manage Access
                            </Link>
                          </UnstableDropdownMenuItem>
                        </UnstableDropdownMenuContent>
                      </UnstableDropdownMenu>
                    </UnstableTableCell>
                  </UnstableTableRow>
                );
              })}
            </UnstableTableBody>
          </UnstableTable>
        )}
      </div>

      <Sheet
        open={editingPrivilege !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingPrivilege(null);
        }}
      >
        <SheetContent ref={sheetContainerRef} className="flex h-full flex-col gap-y-0 sm:max-w-6xl">
          <SheetHeader className="border-b">
            <SheetTitle>Add Additional Privilege for {editingPrivilege?.name}</SheetTitle>
            <SheetDescription>
              Grant {editingPrivilege?.name} access to the secret {secretKey}
            </SheetDescription>
          </SheetHeader>
          {editingPrivilege?.type === "user" && (
            <MembershipProjectAdditionalPrivilegeModifySection
              key={editingPrivilege.membershipId}
              projectMembershipId={editingPrivilege.membershipId}
              onGoBack={() => setEditingPrivilege(null)}
              menuPortalContainerRef={sheetContainerRef}
              initialPermissions={initialPermissions}
            />
          )}
          {editingPrivilege?.type === "identity" && editingPrivilege.identityId && (
            <IdentityProjectAdditionalPrivilegeModifySection
              key={editingPrivilege.identityId}
              identityId={editingPrivilege.identityId}
              onGoBack={() => setEditingPrivilege(null)}
              menuPortalContainerRef={sheetContainerRef}
              initialPermissions={initialPermissions}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
