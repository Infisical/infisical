import { useState } from "react";
import { MoreHorizontalIcon, Trash2Icon, UserPlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import {
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
  TPkiApplicationMember,
  useRemovePkiApplicationMember,
  useUpdatePkiApplicationMemberRole
} from "@app/hooks/api/pkiApplications";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddApplicationMemberModal } from "./AddApplicationMemberModal";

type Props = {
  members: TPkiApplicationMember[];
  applicationId: string;
  projectId: string;
};

type ActorType = "user" | "identity" | "group";

const memberType = (m: TPkiApplicationMember): { label: string; type: ActorType | null } => {
  if (m.actorUserId) return { label: "User", type: "user" };
  if (m.actorIdentityId) return { label: "Machine", type: "identity" };
  if (m.actorGroupId) return { label: "Group", type: "group" };
  return { label: "—", type: null };
};

const displayPrimary = (m: TPkiApplicationMember): string => {
  if (m.details?.name?.trim()) return m.details.name;
  if (m.details?.username?.trim()) return m.details.username;
  if (m.details?.email?.trim()) return m.details.email;
  if (m.details?.slug?.trim()) return m.details.slug;
  return m.actorUserId ?? m.actorIdentityId ?? m.actorGroupId ?? "—";
};

const displaySecondary = (m: TPkiApplicationMember): string | null => {
  if (m.actorUserId) return m.details?.email ?? m.details?.username ?? null;
  if (m.actorIdentityId) return m.details?.authMethod ?? null;
  if (m.actorGroupId) return m.details?.slug ?? null;
  return null;
};

export const ApplicationMembersTab = ({ members, applicationId, projectId }: Props) => {
  const updateRole = useUpdatePkiApplicationMemberRole();
  const removeMember = useRemovePkiApplicationMember();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "removeMember"
  ] as const);
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Users, machine identities, and groups granted access to this Application.
          </CardDescription>
          <CardAction>
            <Button size="sm" variant="project" onClick={() => setIsAddOpen(true)}>
              <UserPlusIcon />
              Add Member
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No members yet</EmptyTitle>
                <EmptyDescription>
                  Add a user, identity, or group to grant access to this Application.
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
                {members.map((m) => {
                  const { label } = memberType(m);
                  const secondary = displaySecondary(m);
                  return (
                    <TableRow key={m.membershipId} className="[&>td]:py-3">
                      <TableCell isTruncatable>
                        <div className="text-foreground">{displayPrimary(m)}</div>
                        {secondary ? <div className="text-xs text-accent">{secondary}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          onValueChange={async (role) => {
                            try {
                              await updateRole.mutateAsync({
                                applicationId,
                                membershipId: m.membershipId,
                                role
                              });
                              createNotification({ type: "success", text: "Role updated" });
                            } catch (err) {
                              const detail =
                                err instanceof Error ? err.message : "Failed to update role.";
                              createNotification({ type: "error", text: detail });
                            }
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="operator">Operator</SelectItem>
                            <SelectItem value="auditor">Auditor</SelectItem>
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
                              onClick={() => handlePopUpOpen("removeMember", m)}
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

      <AddApplicationMemberModal
        applicationId={applicationId}
        projectId={projectId}
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        existingMembers={members}
      />

      <DeleteActionModal
        isOpen={popUp.removeMember.isOpen}
        title="Remove member?"
        subTitle="The member loses access to this Application immediately. They keep their other project memberships."
        onChange={(o) => handlePopUpToggle("removeMember", o)}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          const m = popUp.removeMember.data as TPkiApplicationMember | undefined;
          if (!m) return;
          try {
            await removeMember.mutateAsync({
              applicationId,
              membershipId: m.membershipId
            });
            createNotification({ type: "success", text: "Member removed" });
            handlePopUpClose("removeMember");
          } catch (err) {
            const detail = err instanceof Error ? err.message : "Failed to remove member.";
            createNotification({ type: "error", text: detail });
          }
        }}
      />
    </>
  );
};
