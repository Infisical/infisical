import { useMemo, useState } from "react";
import { MoreHorizontalIcon, Trash2Icon, UserPlusIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  PageLoader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  SignerPermissionActions,
  SignerPermissionSub,
  useSignerPermission
} from "@app/context/SignerPermissionContext";
import {
  SignerMemberRole,
  signerMemberRoleDescriptions,
  signerMemberRoleLabels,
  TSignerMember,
  useListSignerMembers,
  useRemoveSignerGroupMember,
  useRemoveSignerIdentityMember,
  useRemoveSignerUserMember,
  useUpdateSignerGroupRole,
  useUpdateSignerIdentityRole,
  useUpdateSignerUserRole
} from "@app/hooks/api/signers";

import { AddSignerMemberModal } from "./AddSignerMemberModal";

type Props = {
  signerId: string;
};

type MemberKind = "user" | "identity" | "group";

const kindOf = (m: TSignerMember): MemberKind => {
  if (m.actorUserId) return "user";
  if (m.actorIdentityId) return "identity";
  return "group";
};

const KIND_LABEL: Record<MemberKind, string> = {
  user: "User",
  identity: "Machine",
  group: "Group"
};

const labelOf = (m: TSignerMember): string => {
  if (m.actorUserId) {
    return m.details?.name || m.details?.username || m.details?.email || m.actorUserId;
  }
  if (m.actorIdentityId) return m.details?.name || m.actorIdentityId;
  return m.details?.name || m.details?.slug || (m.actorGroupId as string);
};

export const SignerMembersTab = ({ signerId }: Props) => {
  const { permission } = useSignerPermission();
  const canManageMembers = permission.can(
    SignerPermissionActions.ManageMembers,
    SignerPermissionSub.Signer
  );
  const users = useListSignerMembers({ signerId, kind: "user" });
  const identities = useListSignerMembers({ signerId, kind: "identity" });
  const groups = useListSignerMembers({ signerId, kind: "group" });
  const updateUserRole = useUpdateSignerUserRole();
  const removeUserMember = useRemoveSignerUserMember();
  const updateIdentityRole = useUpdateSignerIdentityRole();
  const removeIdentityMember = useRemoveSignerIdentityMember();
  const updateGroupRole = useUpdateSignerGroupRole();
  const removeGroupMember = useRemoveSignerGroupMember();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TSignerMember | null>(null);
  const isRemoving =
    removeUserMember.isPending || removeIdentityMember.isPending || removeGroupMember.isPending;

  const all: TSignerMember[] = useMemo(
    () => [
      ...(users.data?.memberships ?? []),
      ...(identities.data?.memberships ?? []),
      ...(groups.data?.memberships ?? [])
    ],
    [users.data, identities.data, groups.data]
  );

  const isLoading = users.isPending || identities.isPending || groups.isPending;

  if (isLoading) return <PageLoader />;

  const handleRoleChange = (m: TSignerMember, role: SignerMemberRole) => {
    const kind = kindOf(m);
    if (kind === "user" && m.actorUserId) {
      updateUserRole.mutate({ signerId, userId: m.actorUserId, role });
    } else if (kind === "identity" && m.actorIdentityId) {
      updateIdentityRole.mutate({ signerId, identityId: m.actorIdentityId, role });
    } else if (kind === "group" && m.actorGroupId) {
      updateGroupRole.mutate({ signerId, groupId: m.actorGroupId, role });
    }
  };

  const confirmRemove = async () => {
    const m = memberToRemove;
    if (!m) return;
    const kind = kindOf(m);
    try {
      if (kind === "user" && m.actorUserId) {
        await removeUserMember.mutateAsync({ signerId, userId: m.actorUserId });
      } else if (kind === "identity" && m.actorIdentityId) {
        await removeIdentityMember.mutateAsync({ signerId, identityId: m.actorIdentityId });
      } else if (kind === "group" && m.actorGroupId) {
        await removeGroupMember.mutateAsync({ signerId, groupId: m.actorGroupId });
      }
      setMemberToRemove(null);
    } catch {
      // mutation onError surfaces the notification
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Users, machine identities, and groups granted access to this signer.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              onClick={() => setIsAddOpen(true)}
              isDisabled={!canManageMembers}
            >
              <UserPlusIcon />
              Add Member
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {all.length === 0 ? (
            <Empty className="border border-solid">
              <EmptyHeader>
                <EmptyTitle>No members yet</EmptyTitle>
                <EmptyDescription>
                  Add a user, identity, or group to grant access to this signer.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.map((m) => {
                  const kind = kindOf(m);
                  const label = labelOf(m);

                  return (
                    <TableRow key={m.membershipId} className="[&>td]:py-3">
                      <TableCell isTruncatable>
                        <div className="text-foreground">{label}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{KIND_LABEL[kind]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          disabled={!canManageMembers}
                          onValueChange={(role) => handleRoleChange(m, role as SignerMemberRole)}
                        >
                          <SelectTrigger size="sm" className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" align="start" sideOffset={4}>
                            {Object.values(SignerMemberRole).map((role) => (
                              <SelectItem
                                key={role}
                                value={role}
                                description={signerMemberRoleDescriptions[role]}
                              >
                                {signerMemberRoleLabels[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-accent">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton variant="ghost" size="xs">
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="min-w-40" align="end" sideOffset={2}>
                            <DropdownMenuItem
                              variant="danger"
                              isDisabled={!canManageMembers}
                              onClick={() => setMemberToRemove(m)}
                            >
                              <Trash2Icon />
                              Remove Member
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
        </CardContent>
      </Card>

      <AddSignerMemberModal
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        signerId={signerId}
        existingMembers={all}
      />

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove
                ? `${labelOf(memberToRemove)} will lose all access to this signer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRemoving}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isDisabled={isRemoving} onClick={confirmRemove}>
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
