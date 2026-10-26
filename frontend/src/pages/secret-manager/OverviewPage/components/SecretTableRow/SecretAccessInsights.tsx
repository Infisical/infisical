import { useMemo, useRef, useState } from "react";
import { subject } from "@casl/ability";
import { Link } from "@tanstack/react-router";
import axios from "axios";
import { addDays, format, max } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ExternalLinkIcon,
  FilterIcon,
  HardDriveIcon,
  InfoIcon,
  MoreHorizontalIcon,
  NetworkIcon,
  PlusIcon,
  SearchIcon,
  TableIcon,
  TriangleAlertIcon,
  UserIcon,
  UserPlusIcon,
  UsersIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { SecretAccessGraph, TAccessGraphInput } from "@app/components/secrets/SecretAccessGraph";
import {
  SecretReadStatusBadge,
  TReaderReadStatus
} from "@app/components/secrets/SecretReadStatusBadge";
import {
  Button,
  ButtonGroup,
  Combobox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useOrgPermission,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import {
  PermissionConditionOperators,
  ProjectPermissionInsightsActions,
  ProjectPermissionSecretActions
} from "@app/context/ProjectPermissionContext/types";
import { getProjectBaseURL } from "@app/helpers/project";
import {
  useAddUsersToOrg,
  useAddUserToWsNonE2EE,
  useGetOrgUsers,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { useGetAvailableOrgUsers } from "@app/hooks/api/organization/queries";
import { useCreateProjectUserAdditionalPrivilege } from "@app/hooks/api/projectUserAdditionalPrivilege";
import {
  SecretReadNotJudgedReason,
  SecretReadStatus,
  useGetSecretReadActivity
} from "@app/hooks/api/secretInsights";
import { useGetSecretAccessList } from "@app/hooks/api/secrets/queries";
import { SecretAccessListEntry } from "@app/hooks/api/secrets/types";
import { IdentityProjectAdditionalPrivilegeModifySection } from "@app/pages/project/IdentityDetailsByIDPage/components/IdentityProjectAdditionalPrivilegeSection/IdentityProjectAdditionalPrivilegeModifySection";
import { MembershipProjectAdditionalPrivilegeModifySection } from "@app/pages/project/MemberDetailsByIDPage/components/MemberProjectAdditionalPrivilegeSection/MembershipProjectAdditionalPrivilegeModifySection";

type Props = {
  secretKey: string;
  environment: string;
  secretPath: string;
};

type AccessView = "graph" | "table";

const grantsReadValue = (actions: Iterable<string>) =>
  [...actions].some(
    (action) =>
      action === ProjectPermissionSecretActions.ReadValue ||
      action === ProjectPermissionSecretActions.DescribeAndReadValue
  );

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
  isSelf?: boolean;
  onEdit?: () => void;
  inheritedFromGroups?: string[];
  inheritedActions?: Set<string>;
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
].map((opt) => ({
  value: opt.action,
  label: opt.label
}));

function AddMemberPopover({
  secretKey,
  environment,
  secretPath
}: {
  secretKey: string;
  environment: string;
  secretPath: string;
}) {
  const { currentOrg, isSubOrganization } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { permission: orgPermission } = useOrgPermission();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set());
  const [selectedParentOrgUsers, setSelectedParentOrgUsers] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedActions, setSelectedActions] = useState<{ value: string; label: string }[]>([
    { value: ProjectPermissionSecretActions.DescribeSecret, label: "Describe" },
    { value: ProjectPermissionSecretActions.ReadValue, label: "Read Value" }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canGrantAccess =
    orgPermission.can(OrgPermissionMemberActions.Read, OrgPermissionSubjects.Member) &&
    permission.can(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member) &&
    permission.can(
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      ProjectPermissionSub.Member
    ) &&
    permission.can(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);

  const canAddParentOrgUsers =
    isSubOrganization &&
    orgPermission.can(OrgPermissionMemberActions.Create, OrgPermissionSubjects.Member);

  const { data: orgUsers } = useGetOrgUsers(currentOrg.id);
  const { data: parentOrgAvailableUsers } = useGetAvailableOrgUsers(canAddParentOrgUsers);
  const { data: projectMembers } = useGetWorkspaceUsers(currentProject.id);
  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();
  const { mutateAsync: addUsersToOrg } = useAddUsersToOrg();
  const { mutateAsync: createPrivilege } = useCreateProjectUserAdditionalPrivilege();

  const availableOrgUsers = useMemo(() => {
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

  const availableParentUsers = useMemo(() => {
    if (!canAddParentOrgUsers || !parentOrgAvailableUsers) return [];
    return parentOrgAvailableUsers.map((u) => ({
      username: u.username,
      email: u.email ?? u.username,
      label:
        u.firstName && u.lastName
          ? `${u.firstName} ${u.lastName}`
          : u.firstName || u.lastName || u.username
    }));
  }, [canAddParentOrgUsers, parentOrgAvailableUsers]);

  const toggleUser = (username: string, source: "org" | "parent-org") => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
    if (source === "parent-org") {
      setSelectedParentOrgUsers((prev) => {
        const next = new Set(prev);
        if (next.has(username)) {
          next.delete(username);
        } else {
          next.add(username);
        }
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    if (selectedUsers.size === 0 || selectedActions.length === 0) return;

    setIsSubmitting(true);
    try {
      // If parent org users are selected, add them to the sub-org first
      if (selectedParentOrgUsers.size > 0) {
        const parentEmails = availableParentUsers
          .filter((u) => selectedParentOrgUsers.has(u.username))
          .map((u) => u.email);
        await addUsersToOrg({
          organizationId: currentOrg.id,
          inviteeEmails: parentEmails,
          organizationRoleSlug: currentOrg.defaultMembershipRole
        });
      }

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
      setSelectedParentOrgUsers(new Set());
      setIsOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canGrantAccess) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Button variant="project" isDisabled aria-label="Add user to project">
            <UserPlusIcon /> Grant Organization User Access
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          You do not have permission to add members to this project and manage their permissions
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="project" aria-label="Add user to project">
          <UserPlusIcon /> Grant Organization User Access
        </Button>
      </PopoverTrigger>
      <PopoverContent onWheel={(e) => e.stopPropagation()} align="end" className="w-lg p-0">
        <Command>
          <CommandInput aria-label="Search users" placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users available to add.</CommandEmpty>
            {availableOrgUsers.length > 0 && (
              <CommandGroup
                heading={isSubOrganization ? "Sub-Organization Users" : "Organization Users"}
              >
                {availableOrgUsers.map((user) => (
                  <CommandItem
                    key={user.username}
                    value={user.username}
                    keywords={[user.label]}
                    onSelect={() => toggleUser(user.username, "org")}
                  >
                    <CheckIcon
                      className={`size-4 ${selectedUsers.has(user.username) ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="truncate">{user.label}</span>
                    <span className="ml-auto truncate text-xs text-muted">{user.username}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canAddParentOrgUsers && availableParentUsers.length > 0 && (
              <CommandGroup heading="Organization Users">
                {availableParentUsers.map((user) => (
                  <CommandItem
                    key={`parent-${user.username}`}
                    value={`parent-${user.username}`}
                    keywords={[user.label, user.username]}
                    onSelect={() => toggleUser(user.username, "parent-org")}
                  >
                    <CheckIcon
                      className={`size-4 ${selectedUsers.has(user.username) ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="truncate">{user.label}</span>
                    <span className="ml-auto truncate text-xs text-muted">{user.username}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        <div className="border-t border-border px-3 py-2">
          <span className="mb-1 block text-xs text-muted">Grant access:</span>
          <Combobox
            multiple
            value={selectedActions}
            onValueChange={setSelectedActions}
            options={SECRET_ACTION_OPTIONS}
            getOptionValue={(option) => option.value}
            getOptionLabel={(option) => option.label}
            getOptionKeywords={(option) => [option.value]}
            placeholder="Select permissions..."
          />
        </div>
        <div className="border-t border-border px-3 py-2">
          {selectedParentOrgUsers.size > 0 && (
            <p className="mb-1 text-xs text-muted">
              {selectedParentOrgUsers.size} user
              {selectedParentOrgUsers.size !== 1 ? "s" : ""} will be added to this sub-organization
              first.
            </p>
          )}
          <Button
            variant="project"
            size="sm"
            className="w-full"
            isDisabled={selectedUsers.size === 0 || selectedActions.length === 0}
            isPending={isSubmitting}
            onClick={handleSubmit}
          >
            <UserPlusIcon />
            Grant {selectedUsers.size > 0 ? selectedUsers.size : ""} User
            {selectedUsers.size !== 1 ? "s" : ""} Access
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
  const { user: currentUser } = useUser();
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const [editingPrivilege, setEditingPrivilege] = useState<EditingPrivilege | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [typeFilters, setTypeFilters] = useState<Set<AccessRowType>>(() => new Set());
  const [showAllEntities, setShowAllEntities] = useState(true);
  const [view, setView] = useState<AccessView>("graph");

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

  const canReadInsights = permission.can(
    ProjectPermissionInsightsActions.Read,
    ProjectPermissionSub.Insights
  );
  const {
    data: readActivity,
    isLoading: isReadActivityLoading,
    error: readActivityError
  } = useGetSecretReadActivity(
    { projectId: currentProject.id, environment, secretPath, secretKey },
    { enabled: canReadInsights }
  );
  const readActors = useMemo(
    () => new Map(readActivity?.actors.map((actor) => [actor.actorId, actor])),
    [readActivity]
  );

  // What a reader's row and node say about their reads, worded from the status the API gives each reader.
  const readStatusOf = (actorId: string): TReaderReadStatus | undefined => {
    if (!readActivity) return undefined;
    const actor = readActors.get(actorId);
    if (actor?.readStatus === SecretReadStatus.Read && actor.lastReadAt) {
      return { kind: "read", lastReadAt: actor.lastReadAt };
    }
    if (actor?.readStatus === SecretReadStatus.Unused) {
      return { kind: "unread", since: readActivity.readsTrackedSince };
    }
    if (actor?.notJudgedReason === SecretReadNotJudgedReason.ProjectAdmin) {
      return {
        kind: "pending",
        reason:
          "Project admins can read everything by design, so they are not counted as unused access."
      };
    }
    if (actor?.notJudgedReason === SecretReadNotJudgedReason.TrackingTooNew) {
      // The project's start date is too early for a secret or an access that is newer still: each needs 30 days too.
      const judgedAt = max([
        new Date(readActivity.unusedAccessFrom),
        addDays(new Date(readActivity.readsTrackedSince), 30),
        addDays(new Date(actor.accessSince), 30)
      ]);
      return {
        kind: "pending",
        reason: `Reads have only been tracked since ${format(new Date(readActivity.readsTrackedSince), "PP")}. If they still have not read it, they will count as unused access from ${format(judgedAt, "PP")}.`
      };
    }
    if (actor?.notJudgedReason === SecretReadNotJudgedReason.AccessTooNew) {
      return {
        kind: "pending",
        reason: `They got access to this secret on ${format(new Date(actor.accessSince), "PP")}, so they have not had 30 days to read it.`
      };
    }
    if (actor?.notJudgedReason === SecretReadNotJudgedReason.SecretTooNew) {
      return {
        kind: "pending",
        reason: "The secret is newer than 30 days, so nobody has had 30 days to read it."
      };
    }
    return { kind: "pending", reason: "Not counted as unused access." };
  };

  let readActivityDescription = "Loading read activity...";
  if (readActivityError) {
    readActivityDescription =
      (axios.isAxiosError(readActivityError) &&
        (readActivityError.response?.data as { message?: string })?.message) ||
      "Read activity is unavailable.";
  } else if (readActivity) {
    readActivityDescription = `Reads by users and machine identities since ${format(new Date(readActivity.readsTrackedSince), "PP")}, including reads through imports and references.`;
  }

  // Every reader who can read the value, directly or through a group, with one line each to the secret. The read
  // activity names them exactly, with each member's own folder grants applied to what a group gives them; without
  // it, the access list decides, judging a group on its roles alone.
  const graphInput = useMemo<TAccessGraphInput | undefined>(() => {
    if (!secretAccessList) return undefined;
    const groups = secretAccessList.groups.filter((group) => grantsReadValue(group.allowedActions));
    const entries = [
      ...secretAccessList.users.map((entry) => ({ type: "user" as const, entry })),
      ...secretAccessList.identities.map((entry) => ({ type: "identity" as const, entry }))
    ];
    const entryById = new Map(entries.map(({ entry }) => [entry.id, entry]));
    const isDirect = (id: string) => grantsReadValue(entryById.get(id)?.allowedActions ?? []);
    const groupIdsOf = (type: "user" | "identity", id: string) =>
      groups
        .filter((group) => (type === "user" ? group.userIds : group.identityIds).includes(id))
        .map((group) => group.id);
    const toReader = (type: "user" | "identity", id: string, name: string, isAdmin: boolean) => {
      const status = readStatusOf(id);
      return {
        id,
        name,
        type,
        isDirect: isDirect(id),
        groupIds: groupIdsOf(type, id),
        isAdmin,
        lastReadAt: status?.kind === "read" ? status.lastReadAt : undefined,
        unreadSince: status?.kind === "unread" ? status.since : undefined
      };
    };
    const readers = readActivity
      ? readActivity.actors.map((actor) =>
          toReader(actor.actorType, actor.actorId, actor.name, actor.isProjectAdmin)
        )
      : entries.flatMap(({ type, entry }) =>
          isDirect(entry.id) || groupIdsOf(type, entry.id).length
            ? [toReader(type, entry.id, entry.name, false)]
            : []
        );
    return {
      secret: { key: secretKey, environment, secretPath },
      readers,
      // Every group that grants the value is drawn, including one whose members also have it directly.
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        memberCount: group.userIds.length + group.identityIds.length
      })),
      hasReadActivity: Boolean(canReadInsights && readActivity),
      trackedSince: readActivity?.readsTrackedSince
    };
    // readStatusOf only reads readActivity and readActors, which are both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    secretAccessList,
    readActors,
    readActivity,
    canReadInsights,
    secretKey,
    environment,
    secretPath
  ]);

  const renderLastRead = (row: AccessRow) => {
    if (row.type === "group") return null;
    // A folder read is credited to every secret in the folder, including ones this row can only describe.
    const canReadValue = grantsReadValue([
      ...row.entry.allowedActions,
      ...(row.inheritedActions ?? [])
    ]);
    if (!canReadValue) return null;
    if (isReadActivityLoading) return <Skeleton className="h-4 w-20 rounded" />;
    const status = readStatusOf(row.entry.id);
    if (!status) return null;

    return <SecretReadStatusBadge status={status} />;
  };

  const flatRows = useMemo<AccessRow[]>(() => {
    if (!secretAccessList) return [];
    const baseUrl = getProjectBaseURL(currentProject.type);

    // Build lookup: for each user/identity, find groups they belong to that have access
    const groupsWithAccess = secretAccessList.groups.filter((g) => g.allowedActions.length > 0);

    const getGroupInheritance = (
      entityId: string,
      directActions: string[],
      memberField: "userIds" | "identityIds"
    ) => {
      const matchingGroups = groupsWithAccess.filter((g) => g[memberField].includes(entityId));
      const groupNames = matchingGroups.map((g) => g.name);
      const inherited = new Set<string>(
        matchingGroups
          .flatMap((g) => g.allowedActions)
          .filter((action) => !directActions.includes(action))
      );
      return { groupNames, inherited };
    };

    return [
      ...secretAccessList.users.map((user): AccessRow => {
        const { groupNames: inheritedFromGroups, inherited: inheritedActions } =
          getGroupInheritance(user.id, user.allowedActions, "userIds");
        return {
          type: "user",
          entry: user,
          linkTo: `${baseUrl}/members/$membershipId`,
          linkParams: {
            orgId: currentOrg.id,
            projectId: currentProject.id,
            membershipId: user.membershipId
          },
          isSelf: user.name === currentUser.username,
          canEdit:
            currentProject.isLegacyAdditionalPrivilegesEnabled &&
            user.name !== currentUser.username &&
            permission.can(
              ProjectPermissionMemberActions.AssignAdditionalPrivileges,
              subject(ProjectPermissionSub.Member, { userEmail: user.name })
            ),
          onEdit: () =>
            setEditingPrivilege({
              type: "user",
              membershipId: user.membershipId,
              name: user.name
            }),
          inheritedFromGroups,
          inheritedActions
        };
      }),
      ...secretAccessList.identities.map((identity): AccessRow => {
        const { groupNames: identityInheritedGroups, inherited: identityInheritedActions } =
          getGroupInheritance(identity.id, identity.allowedActions, "identityIds");
        return {
          type: "identity",
          entry: identity,
          linkTo: `${baseUrl}/identities/$identityId`,
          linkParams: {
            orgId: currentOrg.id,
            projectId: currentProject.id,
            identityId: identity.id
          },
          canEdit:
            currentProject.isLegacyAdditionalPrivilegesEnabled &&
            permission.can(
              ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
              subject(ProjectPermissionSub.Identity, { identityId: identity.id })
            ),
          onEdit: () =>
            setEditingPrivilege({
              type: "identity",
              membershipId: identity.membershipId,
              identityId: identity.id,
              name: identity.name
            }),
          inheritedFromGroups: identityInheritedGroups,
          inheritedActions: identityInheritedActions
        };
      }),
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
          <ButtonGroup>
            <Button
              size="xs"
              variant={view === "graph" ? "project" : "outline"}
              aria-pressed={view === "graph"}
              onClick={() => setView("graph")}
            >
              <NetworkIcon />
              Graph
            </Button>
            <Button
              size="xs"
              variant={view === "table" ? "project" : "outline"}
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
            >
              <TableIcon />
              Table
            </Button>
          </ButtonGroup>
          {view === "table" && (
            <>
              <Label className="cursor-pointer gap-1.5 text-xs whitespace-nowrap text-muted">
                <Toggle
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
                    When enabled, all project members are shown including those without any access
                    to this secret.
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    variant={isFilterActive ? "project" : "outline"}
                    aria-label="Filter by type"
                  >
                    <FilterIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ALL_TYPE_FILTERS.map((type) => {
                    const { icon: TypeIcon, label } = TYPE_CONFIG[type];
                    return (
                      <DropdownMenuCheckboxItem
                        key={type}
                        checked={typeFilters.has(type)}
                        onCheckedChange={() => toggleTypeFilter(type)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        <TypeIcon className="size-4" />
                        {label}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {view === "table" && (
            <AddMemberPopover
              secretKey={secretKey}
              environment={environment}
              secretPath={secretPath}
            />
          )}
        </div>
        {/* eslint-disable no-nested-ternary */}
        {view === "graph" ? (
          isLoading || !graphInput ? (
            <Skeleton className="h-[560px] w-full" />
          ) : (
            <SecretAccessGraph input={graphInput} />
          )
        ) : isLoading ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                {canReadInsights && <TableHead className="w-40">Last Read</TableHead>}
                {PERMISSION_COLUMNS.filter((col) => !col.isLegacy).map((col) => (
                  <TableHead key={col.action} className="w-[100px] text-center">
                    {col.label}
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={`skeleton-row-${String(i)}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-16 rounded" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24 rounded" />
                  </TableCell>
                  {canReadInsights && (
                    <TableCell className="w-40">
                      <Skeleton className="h-4 w-20 rounded" />
                    </TableCell>
                  )}
                  {PERMISSION_COLUMNS.filter((col) => !col.isLegacy).map((col) => (
                    <TableCell key={col.action} className="w-[100px] text-center">
                      <Skeleton className="mx-auto h-4 w-4 rounded" />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Skeleton className="h-4 w-6 rounded" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : filteredRows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No Results Found</EmptyTitle>
              <EmptyDescription>
                No users, groups, or identities match your search.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table containerClassName="overflow-auto">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-48">Type</TableHead>
                <TableHead>Name</TableHead>
                {canReadInsights && (
                  <TableHead className="w-40">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1">
                          Last Read
                          <InfoIcon className="size-3.5 text-muted" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{readActivityDescription}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                )}
                {visibleColumns.map((col) => (
                  <TableHead key={col.action} className="w-[100px] text-center">
                    {col.isLegacy ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            <TriangleAlertIcon className="size-3.5 text-warning" />
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
                  </TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const { icon: TypeIcon, label: typeLabel } = TYPE_CONFIG[row.type];
                return (
                  <TableRow key={`${row.type}-${row.entry.id}`}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <TypeIcon className="size-4 text-accent" />
                        {typeLabel}
                      </span>
                    </TableCell>
                    <TableCell isTruncatable className="max-w-[180px] font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{row.entry.name}</span>
                        {row.inheritedFromGroups && row.inheritedFromGroups.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-foreground/5 px-1.5 py-0.5 text-xs text-muted">
                                <UsersIcon className="size-3" />
                                {row.inheritedFromGroups.length}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              Access through{" "}
                              {row.inheritedFromGroups.length === 1
                                ? `group: ${row.inheritedFromGroups[0]}`
                                : `groups: ${row.inheritedFromGroups.join(", ")}`}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    {canReadInsights && (
                      <TableCell className="w-40 whitespace-nowrap">
                        {renderLastRead(row)}
                      </TableCell>
                    )}
                    {visibleColumns.map((col) => {
                      const hasDirect = row.entry.allowedActions.includes(col.action);
                      const hasInherited = row.inheritedActions?.has(col.action);
                      return (
                        <TableCell key={col.action} className="w-[100px] text-center">
                          {/* eslint-disable-next-line no-nested-ternary */}
                          {hasDirect ? (
                            <CheckIcon className="mx-auto size-4 text-success" />
                          ) : hasInherited ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <UsersIcon className="mx-auto size-4 text-success" />
                              </TooltipTrigger>
                              <TooltipContent>Inherited from group</TooltipContent>
                            </Tooltip>
                          ) : (
                            <BanIcon className="mx-auto size-4 text-muted" />
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton size="xs" variant="ghost">
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {row.onEdit && (
                            <Tooltip open={row.canEdit ? false : undefined}>
                              <TooltipTrigger>
                                <DropdownMenuItem
                                  isDisabled={!row.canEdit}
                                  onClick={() => row.onEdit?.()}
                                >
                                  <PlusIcon />
                                  Add Additional Privilege
                                </DropdownMenuItem>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {row.isSelf
                                  ? "You cannot modify your own privileges"
                                  : "You do not have permission to perform this action"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <DropdownMenuItem asChild>
                            <Link to={row.linkTo as "."} params={row.linkParams} target="_blank">
                              <ExternalLinkIcon />
                              {row.isSelf ? "View" : "Manage"} Access
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {/* eslint-enable no-nested-ternary */}
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
