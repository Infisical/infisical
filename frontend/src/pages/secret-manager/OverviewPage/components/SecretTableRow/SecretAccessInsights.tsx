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
  UserPlusIcon,
  UsersIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  FilterableSelect,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { useAddUserToWsNonE2EE, useGetOrgUsers, useGetWorkspaceUsers } from "@app/hooks/api";
import { useCreateProjectUserAdditionalPrivilege } from "@app/hooks/api/projectUserAdditionalPrivilege";
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

const SECRET_ACTION_OPTIONS = [
  { action: ProjectPermissionSecretActions.DescribeSecret, label: "Describe" },
  { action: ProjectPermissionSecretActions.ReadValue, label: "Read Value" },
  { action: ProjectPermissionSecretActions.Create, label: "Create" },
  { action: ProjectPermissionSecretActions.Edit, label: "Edit" },
  { action: ProjectPermissionSecretActions.Delete, label: "Delete" }
] as const;

function AddMemberPopover({
  secretKey,
  environment,
  secretPath
}: {
  secretKey: string;
  environment: string;
  secretPath: string;
}) {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set());
  const [selectedActions, setSelectedActions] = useState<{ value: string; label: string }[]>([
    { value: ProjectPermissionSecretActions.DescribeSecret, label: "Describe" },
    { value: ProjectPermissionSecretActions.ReadValue, label: "Read Value" }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreateMember = permission.can(
    ProjectPermissionMemberActions.Create,
    ProjectPermissionSub.Member
  );

  const { data: orgUsers } = useGetOrgUsers(currentOrg.id);
  const { data: projectMembers } = useGetWorkspaceUsers(currentProject.id);
  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();
  const { mutateAsync: createPrivilege } = useCreateProjectUserAdditionalPrivilege();

  const availableUsers = useMemo(() => {
    if (!orgUsers || !projectMembers) return [];
    const projectUsernames = new Set(projectMembers.map((m) => m.user.username));
    return orgUsers
      .filter(({ user: u }) => !projectUsernames.has(u.username))
      .map(({ user: u }) => ({
        username: u.username,
        label:
          u.firstName && u.lastName
            ? `${u.firstName} ${u.lastName}`
            : u.firstName || u.lastName || u.email || u.username
      }));
  }, [orgUsers, projectMembers]);

  const toggleUser = (username: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedUsers.size === 0 || selectedActions.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = (await addUserToProject({
        projectId: currentProject.id,
        orgId: currentOrg.id,
        usernames: [...selectedUsers],
        roleSlugs: ["no-access"]
      })) as { memberships: { id: string; userId: string }[] };

      const privilegePermissions = [
        {
          action: selectedActions.map((a) => a.value),
          subject: ProjectPermissionSub.Secrets,
          conditions: {
            environment,
            secretPath,
            secretName: { $eq: secretKey }
          }
        }
      ];

      await Promise.all(
        result.memberships.map((membership) =>
          createPrivilege({
            projectMembershipId: membership.id,
            type: { isTemporary: false },
            permissions: privilegePermissions
          })
        )
      );

      createNotification({
        text: `Added ${selectedUsers.size} user${selectedUsers.size > 1 ? "s" : ""} with access to this secret`,
        type: "success"
      });
      setSelectedUsers(new Set());
      setIsOpen(false);
    } catch {
      createNotification({
        text: "Failed to add users to project",
        type: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canCreateMember) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="project" aria-label="Add user to project">
          <UserPlusIcon /> Grant Organization Access
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-lg p-0">
        <Command>
          <CommandInput placeholder="Search organization users..." />
          <CommandList>
            <CommandEmpty>No users available to add.</CommandEmpty>
            <CommandGroup>
              {availableUsers.map((user) => (
                <CommandItem
                  key={user.username}
                  value={user.username}
                  keywords={[user.label]}
                  onSelect={() => toggleUser(user.username)}
                >
                  <CheckIcon
                    className={`size-4 ${selectedUsers.has(user.username) ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{user.label}</span>
                  <span className="ml-auto truncate text-xs text-muted">{user.username}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t border-border px-3 py-2">
          <span className="mb-1 block text-xs text-muted">Grant access:</span>
          <FilterableSelect
            isMulti
            value={selectedActions}
            onChange={(opts) =>
              setSelectedActions([...(opts as { value: string; label: string }[])])
            }
            options={SECRET_ACTION_OPTIONS.map((opt) => ({
              value: opt.action,
              label: opt.label
            }))}
            placeholder="Select permissions..."
          />
        </div>
        <div className="border-t border-border px-3 py-2">
          <Button
            variant="project"
            size="sm"
            className="w-full"
            isDisabled={selectedUsers.size === 0 || selectedActions.length === 0}
            isPending={isSubmitting}
            onClick={handleSubmit}
          >
            <PlusIcon />
            Add {selectedUsers.size > 0 ? selectedUsers.size : ""} User
            {selectedUsers.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SecretAccessInsights({ secretKey, environment, secretPath }: Props) {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const [editingPrivilege, setEditingPrivilege] = useState<EditingPrivilege | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<AccessRowType>>(() => new Set());
  const [showAllEntities, setShowAllEntities] = useState(true);

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

  return (
    <>
      <div className="flex thin-scrollbar flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <Label className="cursor-pointer gap-1.5 text-xs whitespace-nowrap text-muted">
            <Switch
              size="sm"
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
          <AddMemberPopover
            secretKey={secretKey}
            environment={environment}
            secretPath={secretPath}
          />
        </div>
        {/* eslint-disable-next-line no-nested-ternary */}
        {isLoading ? (
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
              {Array.from({ length: 10 }).map((_, i) => (
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
        ) : filteredRows.length === 0 ? (
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
                <UnstableTableHead className="w-48 border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
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
