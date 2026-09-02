import { useState } from "react";
import { format } from "date-fns";
import { MoreHorizontalIcon, UserPlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DeleteConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
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
  TableRow
} from "@app/components/v3";
import {
  useGetAgentVaultAccessBundle,
  useRemoveAgentVaultAccessBundleMember
} from "@app/hooks/api/agentVault";
import { TAgentVaultMember } from "@app/hooks/api/agentVault/types";

import { AddMemberDialog } from "./AddMemberDialog";
import { memberDisplayName, MemberName } from "./MemberName";

type Props = {
  /** The bundle whose access is being managed. Null keeps the sheet closed. */
  accessBundle: { id: string; name: string } | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ManageAccessSheet = ({ accessBundle, onOpenChange }: Props) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultMember | null>(null);

  const { data: bundleDetails, isPending } = useGetAgentVaultAccessBundle(accessBundle?.id ?? "");
  const removeMember = useRemoveAgentVaultAccessBundleMember();

  const members = bundleDetails?.members ?? [];

  const handleRemove = async () => {
    if (!accessBundle || !memberToRemove) return;

    await removeMember.mutateAsync({
      accessBundleId: accessBundle.id,
      memberId: memberToRemove.id
    });
    createNotification({
      text: `Access bundle revoked from "${memberDisplayName(memberToRemove)}"`,
      type: "success"
    });
    setMemberToRemove(null);
  };

  return (
    <Sheet open={Boolean(accessBundle)} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Manage Access</SheetTitle>
          <SheetDescription>
            Who can mint a session over {accessBundle?.name}. Revoking takes effect at the next
            proxy poll.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-center gap-2 border-b border-border p-4">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              Members
              <Badge variant="av">{members.length}</Badge>
            </span>
            <Button size="sm" variant="av" className="ml-auto" onClick={() => setIsAddOpen(true)}>
              <UserPlusIcon />
              Grant Access
            </Button>
          </div>

          {isPending && (
            <div className="p-4">
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!isPending && members.length === 0 && (
            <div className="p-4">
              <Empty className="border" frame="dashed">
                <EmptyHeader>
                  <EmptyTitle>No members yet</EmptyTitle>
                  <EmptyDescription>
                    Grant this bundle to a user, machine identity or group.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}

          {!isPending && members.length > 0 && (
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label={`Actions for ${memberDisplayName(member)}`}
                          >
                            <MoreHorizontalIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent sideOffset={2} align="end">
                          <DropdownMenuItem
                            variant="danger"
                            onClick={() => setMemberToRemove(member)}
                          >
                            Revoke Access
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {accessBundle && (
          <AddMemberDialog
            isOpen={isAddOpen}
            onOpenChange={setIsAddOpen}
            accessBundleId={accessBundle.id}
            members={members}
          />
        )}

        <DeleteConfirmDialog
          isOpen={Boolean(memberToRemove)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setMemberToRemove(null);
          }}
          title={`Revoke access for "${memberToRemove ? memberDisplayName(memberToRemove) : ""}"`}
          description="They lose this bundle, and any live session they hold stops reaching its hosts at the next proxy poll."
          confirmKey={memberToRemove ? memberDisplayName(memberToRemove) : ""}
          confirmLabel="Revoke Access"
          isPending={removeMember.isPending}
          onConfirm={handleRemove}
        />
      </SheetContent>
    </Sheet>
  );
};
