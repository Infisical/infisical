import { useState } from "react";
import { format } from "date-fns";
import { XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useRemoveAgentVaultAccessBundleMember } from "@app/hooks/api/agentVault";
import { TAgentVaultMember } from "@app/hooks/api/agentVault/types";

import { AddMemberDialog } from "./AddMemberDialog";
import { memberDisplayName, MemberName } from "./MemberName";

type Props = {
  accessBundleId: string;
  members: TAgentVaultMember[];
};

export const MembersCard = ({ accessBundleId, members }: Props) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultMember | null>(null);
  const removeMember = useRemoveAgentVaultAccessBundleMember();

  const handleRemove = async () => {
    if (!memberToRemove) return;

    await removeMember.mutateAsync({ accessBundleId, memberId: memberToRemove.id });
    createNotification({
      text: `Access bundle revoked from "${memberDisplayName(memberToRemove)}"`,
      type: "success"
    });
    setMemberToRemove(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Who can mint a session over this bundle. Removing a member takes effect within about a
          minute.
        </CardDescription>
        <CardAction>
          <Button variant="av" onClick={() => setIsAddOpen(true)}>
            Grant Access
          </Button>
        </CardAction>
      </CardHeader>

      {members.length === 0 ? (
        <CardContent>
          <Empty className="border" frame="dashed">
            <EmptyHeader>
              <EmptyTitle>No members yet</EmptyTitle>
              <EmptyDescription>
                Grant this bundle to a user, machine identity or group.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Granted</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <MemberName member={member} />
                </TableCell>
                <TableCell>{format(new Date(member.createdAt), "MMM d, yyyy")}</TableCell>
                <TableCell variant="action">
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label={`Revoke access for ${memberDisplayName(member)}`}
                    onClick={() => setMemberToRemove(member)}
                  >
                    <XIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AddMemberDialog
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        accessBundleId={accessBundleId}
        members={members}
      />

      <DeleteConfirmDialog
        isOpen={Boolean(memberToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMemberToRemove(null);
        }}
        title={`Revoke access for "${memberToRemove ? memberDisplayName(memberToRemove) : ""}"`}
        description="They lose this bundle, and any live session they hold stops reaching its hosts within about a minute."
        confirmKey={memberToRemove ? memberDisplayName(memberToRemove) : ""}
        confirmLabel="Revoke Access"
        isPending={removeMember.isPending}
        onConfirm={handleRemove}
      />
    </Card>
  );
};
