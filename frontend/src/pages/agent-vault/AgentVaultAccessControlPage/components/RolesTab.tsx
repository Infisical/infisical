import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CopyIcon,
  ExternalLinkIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UserCogIcon
} from "lucide-react";

import {
  agentVaultRoleRules,
  CreateAgentVaultRoleDialog,
  DeleteAgentVaultRoleDialog,
  describeRoleRules,
  TRoleToCopy,
  TRoleToDelete
} from "@app/components/agent-vault/roles";
import { HighlightText } from "@app/components/utilities/HighlightText";
import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
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
  OverflowBadgeList,
  RowLink,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { canReadAgentVaultMembers } from "@app/helpers/agentVaultPermissions";
import { isCustomProjectRole } from "@app/helpers/roles";
import { useGetProjectRoles } from "@app/hooks/api";
import {
  useGetAgentVaultRoleDetails,
  useListAllAgentVaultMembers
} from "@app/hooks/api/agentVaultRoles";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const BUILT_IN_ORDER: string[] = [ProjectMembershipRole.Admin, ProjectMembershipRole.NoAccess];

const GrantsCell = ({ parts }: { parts: string[] | null }) => {
  if (!parts) return <span className="text-sm text-muted">Couldn&apos;t load</span>;
  if (!parts.length) return <span className="text-sm text-muted">No permissions</span>;
  return (
    <OverflowBadgeList
      items={parts}
      getKey={(part) => part}
      getLabel={(part) => part}
      maxBadgeWidth={240}
      className="w-full"
    />
  );
};

export const RolesTab = () => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const canCreateRoles = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Role);
  const canDeleteRoles = permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Role);
  const canReadMembers = canReadAgentVaultMembers(permission);

  const {
    data: roles,
    isPending,
    isError,
    refetch
  } = useGetProjectRoles(projectId, ProjectType.AgentVault);
  // The list leaves out what each custom role grants, so each is read on its own. Built-in roles grant what the editor
  // says they do.
  const roleSlugs = useMemo(
    () => (roles ?? []).filter((role) => isCustomProjectRole(role.slug)).map((role) => role.slug),
    [roles]
  );
  const details = useGetAgentVaultRoleDetails(projectId, roleSlugs);
  const { data: members, isPending: isMembersPending } = useListAllAgentVaultMembers(projectId, {
    enabled: canReadMembers
  });

  const holderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (members?.items ?? []).forEach((member) =>
      member.roles.forEach((role) => counts.set(role, (counts.get(role) ?? 0) + 1))
    );
    return counts;
  }, [members]);

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roleToCopy, setRoleToCopy] = useState<TRoleToCopy | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<TRoleToDelete | null>(null);

  const displayed = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rank = (slug: string) =>
      BUILT_IN_ORDER.includes(slug) ? BUILT_IN_ORDER.indexOf(slug) : BUILT_IN_ORDER.length;
    return (roles ?? [])
      .filter(
        (role) =>
          !term ||
          [role.name, role.slug, role.description ?? ""].some((text) =>
            text.toLowerCase().includes(term)
          )
      )
      .sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name));
  }, [roles, search]);

  const columnCount = canReadMembers ? 5 : 4;

  const renderBody = () => {
    if (isError) {
      return (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Couldn&apos;t load roles</EmptyTitle>
              <EmptyDescription>Check your connection and try again.</EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </Empty>
        </CardContent>
      );
    }

    if (!isPending && !displayed.length) {
      return (
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No roles match your search</EmptyTitle>
              <EmptyDescription>Try a different search term.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead isTruncatable className="w-2/5">
              Name
            </TableHead>
            <TableHead isTruncatable className="w-1/3">
              Grants
            </TableHead>
            {canReadMembers && <TableHead className="w-36">Assigned To</TableHead>}
            <TableHead className="w-36">Type</TableHead>
            <TableHead variant="action" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending &&
            Array.from({ length: 3 }).map((_, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <TableRow key={`role-skeleton-${index}`}>
                {Array.from({ length: columnCount }).map((__, cell) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableCell key={`role-skeleton-${index}-${cell}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isPending &&
            displayed.map((role) => {
              const isCustom = isCustomProjectRole(role.slug);
              const rules = isCustom
                ? details.bySlug.get(role.slug)?.permissions
                : agentVaultRoleRules({ slug: role.slug, permissions: [] });
              const isDetailPending = isCustom && details.pendingSlugs.has(role.slug);
              const holderCount = holderCounts.get(role.slug) ?? 0;
              const roleLink = {
                to: "/organizations/$orgId/projects/agent-vault/$projectId/roles/$roleSlug" as const,
                params: { orgId: currentOrg.id, projectId, roleSlug: role.slug }
              };

              return (
                // A built-in role gets a new id on every read, so rows are keyed by slug.
                <TableRow key={role.slug} linked>
                  <TableCell isTruncatable className="min-w-48">
                    <RowLink {...roleLink} title={role.name}>
                      <HighlightText text={role.name} highlight={search} />
                    </RowLink>
                    <div className="truncate text-xs leading-4 text-muted">
                      {role.description || role.slug}
                    </div>
                  </TableCell>
                  <TableCell isTruncatable className="min-w-64">
                    {isDetailPending ? (
                      <Skeleton className="h-4 w-48" />
                    ) : (
                      <GrantsCell parts={rules ? describeRoleRules(rules) : null} />
                    )}
                  </TableCell>
                  {canReadMembers && (
                    <TableCell className="text-sm">
                      {isMembersPending ? (
                        <Skeleton className="h-4 w-8" />
                      ) : (
                        <span className={holderCount ? undefined : "text-muted"}>
                          {holderCount}
                        </span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    {isCustom ? (
                      <Badge variant="info">
                        <UserCogIcon />
                        Custom
                      </Badge>
                    ) : (
                      <Badge variant="neutral">
                        <LockIcon />
                        Built-In
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell variant="action">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          variant="ghost"
                          size="xs"
                          aria-label={`Open actions for ${role.name}`}
                        >
                          <MoreHorizontalIcon />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent sideOffset={2} align="end">
                        <DropdownMenuItem asChild>
                          <Link {...roleLink}>
                            <ExternalLinkIcon />
                            Open Role
                          </Link>
                        </DropdownMenuItem>
                        {canCreateRoles && role.slug !== ProjectMembershipRole.NoAccess && (
                          <DropdownMenuItem
                            onClick={() => setRoleToCopy({ slug: role.slug, name: role.name })}
                          >
                            <CopyIcon />
                            Duplicate Role
                          </DropdownMenuItem>
                        )}
                        {isCustom && canDeleteRoles && (
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() =>
                              setRoleToDelete({ id: role.id, name: role.name, slug: role.slug })
                            }
                          >
                            <TrashIcon />
                            Delete Role
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search roles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search roles..."
          />
        </InputGroup>
        <Button variant="av" isDisabled={!canCreateRoles} onClick={() => setIsCreateOpen(true)}>
          <PlusIcon />
          Create Role
        </Button>
      </CardContent>

      {renderBody()}

      <CreateAgentVaultRoleDialog
        isOpen={isCreateOpen || Boolean(roleToCopy)}
        copyFrom={roleToCopy}
        onOpenChange={(isOpen) => {
          if (isOpen) return;
          setIsCreateOpen(false);
          setRoleToCopy(null);
        }}
      />
      <DeleteAgentVaultRoleDialog
        role={roleToDelete}
        holderCount={
          roleToDelete && canReadMembers && !isMembersPending
            ? (holderCounts.get(roleToDelete.slug) ?? 0)
            : undefined
        }
        onOpenChange={(isOpen) => {
          if (!isOpen) setRoleToDelete(null);
        }}
      />
    </Card>
  );
};
