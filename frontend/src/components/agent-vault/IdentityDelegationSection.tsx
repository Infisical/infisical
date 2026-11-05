import { useState } from "react";
import { format } from "date-fns";
import { UserCogIcon, UsersRoundIcon } from "lucide-react";

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { useGetAgentVaultDelegation } from "@app/hooks/api/agentVault";
import { AgentVaultDelegationScope, AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { ManageDelegationSheet, TDelegationSubjectRow } from "./ManageDelegationSheet";
import { memberDisplayName, MemberName } from "./MemberName";
import { MissingAccessBundlesHint } from "./MissingAccessBundlesHint";

type Props = {
  machineIdentityId: string;
  machineIdentityName: string;
};

// Only admins can read or change a delegation, so members don't see the section at all. Changes happen
// in the Manage Delegation sheet; this lists who the delegation covers.
export const IdentityDelegationSection = ({ machineIdentityId, machineIdentityName }: Props) => {
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data, isPending, isError, isFetching, refetch } = useGetAgentVaultDelegation(
    machineIdentityId,
    isAdmin
  );
  const delegation = data ?? null;
  // Without a successful read the sheet would start from a list it never saw.
  const isLoadError = isError && data === undefined;
  const [isManageOpen, setIsManageOpen] = useState(false);

  if (!isAdmin) return null;

  const isAllMembers = delegation?.scope === AgentVaultDelegationScope.AllMembers;
  const subjects: TDelegationSubjectRow[] = [
    ...(delegation?.groups ?? []).map((group) => ({
      type: AgentVaultMemberType.Group as const,
      ...group
    })),
    ...(delegation?.users ?? []).map((user) => ({
      type: AgentVaultMemberType.User as const,
      ...user
    }))
  ];

  const renderList = () => {
    if (isPending) return <Skeleton className="h-16 w-full" />;
    if (isLoadError) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Couldn&apos;t load the delegation</EmptyTitle>
            <EmptyDescription>
              Reload to see its users and groups before you add or remove any.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              isPending={isFetching}
              onClick={() => refetch().catch(() => {})}
            >
              Reload
            </Button>
          </EmptyContent>
        </Empty>
      );
    }
    if (!delegation) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No users or groups yet</EmptyTitle>
            <EmptyDescription>
              Manage the delegation to let this machine identity start sessions on behalf of users
              and groups.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <Table className="overflow-hidden rounded-md border border-border">
        <TableHeader>
          <TableRow>
            <TableHead>User or Group</TableHead>
            <TableHead>Added</TableHead>
            <TableHead variant="action" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isAllMembers ? (
            <TableRow>
              <TableCell>
                <div className="flex min-w-0 items-center gap-2.5">
                  <UsersRoundIcon className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="truncate">All Agent Vault Members</div>
                    <div className="truncate text-xs leading-4 text-muted">
                      Every user in Agent Vault, including users added later
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>{format(new Date(delegation.updatedAt), "MMM d, yyyy")}</TableCell>
              <TableCell variant="action">
                <div className="flex items-center justify-end gap-2">
                  <MissingAccessBundlesHint
                    bundles={delegation.missingAccessBundles}
                    machineIdentityName={machineIdentityName}
                    onBehalfOf="Agent Vault members"
                  />
                </div>
              </TableCell>
            </TableRow>
          ) : (
            subjects.map((subject) => (
              <TableRow key={`${subject.type}:${subject.id}`}>
                <TableCell>
                  <MemberName member={subject} />
                </TableCell>
                <TableCell>{format(new Date(subject.addedAt), "MMM d, yyyy")}</TableCell>
                <TableCell variant="action">
                  <div className="flex items-center justify-end gap-2">
                    <MissingAccessBundlesHint
                      bundles={subject.missingAccessBundles}
                      machineIdentityName={machineIdentityName}
                      onBehalfOf={
                        subject.type === AgentVaultMemberType.Group
                          ? `members of "${memberDisplayName(subject)}"`
                          : `"${memberDisplayName(subject)}"`
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Delegation
          <DocumentationLinkBadge href={AgentVaultDocsUrls.sessionsOnBehalfOfUsers} />
        </CardTitle>
        <CardDescription>
          Lets this machine identity start sessions on behalf of these users and groups, using each
          user&apos;s personal values. It can still start its own sessions.
        </CardDescription>
        {!isPending && !isLoadError && (
          <CardAction>
            <Button variant="av" onClick={() => setIsManageOpen(true)}>
              <UserCogIcon />
              Manage Delegation
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{renderList()}</CardContent>

      <ManageDelegationSheet
        machineIdentity={isManageOpen ? { id: machineIdentityId, name: machineIdentityName } : null}
        onOpenChange={setIsManageOpen}
      />
    </Card>
  );
};
