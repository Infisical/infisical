import { useState } from "react";
import { format } from "date-fns";
import { MoreHorizontalIcon, Trash2Icon, UserPlusIcon, UsersRoundIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import {
  useDeleteAgentVaultDelegation,
  useGetAgentVaultDelegation,
  useSetAgentVaultDelegation
} from "@app/hooks/api/agentVault";
import { AgentVaultDelegationScope, AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActor, TAgentVaultMissingAccessBundle } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { AddDelegationSubjectsDialog } from "./AddDelegationSubjectsDialog";
import { memberDisplayName, MemberName } from "./MemberName";
import { MissingAccessBundlesHint } from "./MissingAccessBundlesHint";

type Props = {
  machineIdentityId: string;
  machineIdentityName: string;
};

type TSubjectRow = TAgentVaultActor & {
  addedAt: string;
  missingAccessBundles: TAgentVaultMissingAccessBundle[];
};

type TPendingRemoval = { kind: "subject"; subject: TSubjectRow } | { kind: "all-members" };

// Only admins can read or change a delegation, so members don't see the section at all.
export const IdentityDelegationSection = ({ machineIdentityId, machineIdentityName }: Props) => {
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data, isPending } = useGetAgentVaultDelegation(machineIdentityId, isAdmin);
  const delegation = data ?? null;
  const setDelegation = useSetAgentVaultDelegation();
  const deleteDelegation = useDeleteAgentVaultDelegation();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<TPendingRemoval | null>(null);

  if (!isAdmin) return null;

  const isAllMembers = delegation?.scope === AgentVaultDelegationScope.AllMembers;
  const subjects: TSubjectRow[] = [
    ...(delegation?.groups ?? []).map((group) => ({
      type: AgentVaultMemberType.Group as const,
      ...group
    })),
    ...(delegation?.users ?? []).map((user) => ({
      type: AgentVaultMemberType.User as const,
      ...user
    }))
  ];
  const isMutating = setDelegation.isPending || deleteDelegation.isPending;
  // A delegation to selected users names at least one, so taking out the last one removes the delegation.
  const removesDelegation = pendingRemoval?.kind === "all-members" || subjects.length === 1;

  const applyRemoval = async () => {
    if (!pendingRemoval) return;
    try {
      if (removesDelegation) {
        await deleteDelegation.mutateAsync({ machineIdentityId });
        createNotification({
          text: `Delegation for "${machineIdentityName}" removed`,
          type: "success"
        });
      } else if (pendingRemoval.kind === "subject") {
        const { subject } = pendingRemoval;
        const remaining = subjects.filter(
          (row) => !(row.type === subject.type && row.id === subject.id)
        );
        await setDelegation.mutateAsync({
          machineIdentityId,
          scope: AgentVaultDelegationScope.Selected,
          userIds: remaining
            .filter((row) => row.type === AgentVaultMemberType.User)
            .map((row) => row.id),
          groupIds: remaining
            .filter((row) => row.type === AgentVaultMemberType.Group)
            .map((row) => row.id)
        });
        createNotification({
          text: `"${memberDisplayName(subject)}" removed from the delegation`,
          type: "success"
        });
      }
      setPendingRemoval(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const removalCopy = () => {
    if (!pendingRemoval) return { title: "", description: "" };
    if (pendingRemoval.kind === "all-members") {
      return {
        title: "Stop Acting on Behalf of All Members",
        description: `"${machineIdentityName}" can no longer start sessions on behalf of anyone until you add users or groups, and the sessions it started stop working at the next proxy poll.`
      };
    }
    const { subject } = pendingRemoval;
    const name = memberDisplayName(subject);
    const whose =
      subject.type === AgentVaultMemberType.Group ? `the members of "${name}"` : `"${name}"`;
    return {
      title: `Remove "${name}" From the Delegation`,
      description: `"${machineIdentityName}" can no longer start sessions on behalf of ${whose}, and the sessions it started for them stop working at the next proxy poll.${
        removesDelegation ? " This is the last user or group, so the delegation is removed." : ""
      }`
    };
  };
  const copy = removalCopy();

  const rowActions = (label: string, onRemove: () => void) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="ghost" size="xs" aria-label={`Actions for ${label}`}>
          <MoreHorizontalIcon />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={2} align="end">
        <DropdownMenuItem variant="danger" onClick={onRemove}>
          <Trash2Icon />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderList = () => {
    if (isPending) return <Skeleton className="h-16 w-full" />;
    if (!delegation) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No users or groups yet</EmptyTitle>
            <EmptyDescription>
              Add a user or group to let this machine identity start sessions on their behalf.
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
                  {rowActions("All Agent Vault Members", () =>
                    setPendingRemoval({ kind: "all-members" })
                  )}
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
                    {rowActions(memberDisplayName(subject), () =>
                      setPendingRemoval({ kind: "subject", subject })
                    )}
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
        {!isPending && (
          <CardAction>
            <Button variant="av" onClick={() => setIsAddOpen(true)}>
              <UserPlusIcon />
              Add Users or Groups
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{renderList()}</CardContent>

      <AddDelegationSubjectsDialog
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        machineIdentityId={machineIdentityId}
        machineIdentityName={machineIdentityName}
        delegation={delegation}
      />

      <AlertDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(isOpen) => {
          if (!isOpen && !isMutating) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isMutating}
              onClick={async (event) => {
                event.preventDefault();
                await applyRemoval();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
