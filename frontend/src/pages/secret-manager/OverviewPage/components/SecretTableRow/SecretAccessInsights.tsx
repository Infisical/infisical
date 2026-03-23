import { useMemo, useRef, useState } from "react";
import { subject } from "@casl/ability";
import { Link } from "@tanstack/react-router";
import {
  ExternalLinkIcon,
  HardDriveIcon,
  MoreVerticalIcon,
  PlusIcon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import {
  Badge,
  EmptyMedia,
  Item,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton
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
import { camelCaseToSpaces } from "@app/lib/fn/string";
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

function AccessCard({
  entry,
  linkTo,
  linkParams,
  onEdit
}: {
  entry: SecretAccessListEntry;
  linkTo?: string;
  linkParams?: Record<string, string>;
  onEdit?: () => void;
}) {
  const cardContent = (
    <>
      <ItemContent className="overflow-hidden">
        <ItemTitle className="w-full overflow-hidden">
          <span className="truncate">{entry.name}</span>
        </ItemTitle>
      </ItemContent>
      <ItemFooter>
        <div className="mt-2 flex flex-wrap gap-2">
          {entry.allowedActions.map((action) => (
            <Badge key={action} className="capitalize" variant="neutral">
              {camelCaseToSpaces(action)}
            </Badge>
          ))}
        </div>
      </ItemFooter>
    </>
  );

  if (linkTo && linkParams) {
    return (
      <Item variant="outline" asChild className="group relative">
        <Link to={linkTo as "."} params={linkParams}>
          <div className="flex w-full items-start justify-between gap-2">
            <div className="min-w-0 flex-1">{cardContent}</div>
            <UnstableDropdownMenu>
              <UnstableDropdownMenuTrigger asChild>
                <UnstableIconButton
                  size="xs"
                  variant="ghost"
                  className="absolute top-1 right-1 shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <MoreVerticalIcon />
                </UnstableIconButton>
              </UnstableDropdownMenuTrigger>
              <UnstableDropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {onEdit && (
                  <UnstableDropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEdit();
                    }}
                  >
                    <PlusIcon />
                    Add Additional Privilege
                  </UnstableDropdownMenuItem>
                )}
                <UnstableDropdownMenuItem asChild>
                  <Link to={linkTo as "."} params={linkParams}>
                    <ExternalLinkIcon />
                    Manage Access
                  </Link>
                </UnstableDropdownMenuItem>
              </UnstableDropdownMenuContent>
            </UnstableDropdownMenu>
          </div>
        </Link>
      </Item>
    );
  }

  return <Item variant="outline">{cardContent}</Item>;
}

function SectionHeader({
  icon,
  title,
  count
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <span className="text-sm font-medium tracking-wide text-label">{title}</span>
      <Badge variant="neutral" className="text-xs">
        {count}
      </Badge>
    </div>
  );
}

export function SecretAccessInsights({ secretKey, environment, secretPath }: Props) {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const [editingPrivilege, setEditingPrivilege] = useState<EditingPrivilege | null>(null);

  const canEditMemberPrivileges = permission.can(
    ProjectPermissionMemberActions.Edit,
    ProjectPermissionSub.Member
  );

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
    secretKey
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-4">
        {Array.from({ length: 3 }).map((_, sectionIndex) => (
          <div key={`section-skeleton-${String(sectionIndex)}`}>
            <div className="mb-3 flex items-center gap-2">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-5 w-6 rounded" />
            </div>
            <div className="flex flex-col gap-4">
              {Array.from({ length: 2 }).map((__, itemIndex) => (
                <Skeleton
                  key={`section-skeleton-${String(itemIndex)}`}
                  className="h-[69.25px] rounded-md"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const hasUsers = secretAccessList && secretAccessList.users.length > 0;
  const hasIdentities = secretAccessList && secretAccessList.identities.length > 0;
  const hasGroups = secretAccessList && secretAccessList.groups.length > 0;
  const hasAnyAccess = hasUsers || hasIdentities || hasGroups;

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
      <div className="flex thin-scrollbar flex-col gap-6 overflow-y-auto p-4">
        {hasUsers && (
          <div>
            <SectionHeader
              icon={<UserIcon className="size-4 text-accent" />}
              title="Users"
              count={secretAccessList.users.length}
            />
            <ItemGroup>
              {secretAccessList.users.map((user) => (
                <AccessCard
                  key={user.id}
                  entry={user}
                  linkTo={`${getProjectBaseURL(currentProject.type)}/members/$membershipId`}
                  linkParams={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id,
                    membershipId: user.membershipId
                  }}
                  onEdit={
                    canEditMemberPrivileges
                      ? () =>
                          setEditingPrivilege({
                            type: "user",
                            membershipId: user.membershipId,
                            name: user.name
                          })
                      : undefined
                  }
                />
              ))}
            </ItemGroup>
          </div>
        )}

        {hasIdentities && (
          <div>
            <SectionHeader
              icon={<HardDriveIcon className="size-4 text-accent" />}
              title="Machine Identities"
              count={secretAccessList.identities.length}
            />
            <ItemGroup>
              {secretAccessList.identities.map((identity) => {
                const canEditIdentity = permission.can(
                  ProjectPermissionIdentityActions.Edit,
                  subject(ProjectPermissionSub.Identity, { identityId: identity.id })
                );

                return (
                  <AccessCard
                    key={identity.id}
                    entry={identity}
                    linkTo={`${getProjectBaseURL(currentProject.type)}/identities/$identityId`}
                    linkParams={{
                      orgId: currentOrg.id,
                      projectId: currentProject.id,
                      identityId: identity.id
                    }}
                    onEdit={
                      canEditIdentity
                        ? () =>
                            setEditingPrivilege({
                              type: "identity",
                              membershipId: identity.membershipId,
                              identityId: identity.id,
                              name: identity.name
                            })
                        : undefined
                    }
                  />
                );
              })}
            </ItemGroup>
          </div>
        )}

        {hasGroups && (
          <div>
            <SectionHeader
              icon={<UsersIcon className="size-4 text-accent" />}
              title="Groups"
              count={secretAccessList.groups.length}
            />
            <ItemGroup>
              {secretAccessList.groups.map((group) => (
                <AccessCard
                  key={group.id}
                  entry={group}
                  linkTo={`${getProjectBaseURL(currentProject.type)}/groups/$groupId`}
                  linkParams={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id,
                    groupId: group.id
                  }}
                />
              ))}
            </ItemGroup>
          </div>
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
