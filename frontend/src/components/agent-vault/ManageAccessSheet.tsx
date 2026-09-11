import { useState } from "react";
import { format } from "date-fns";
import { BanIcon, MoreHorizontalIcon, UserPlusIcon } from "lucide-react";

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
  accessBundle: { id: string; name: string } | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ManageAccessSheet = ({ accessBundle, onOpenChange }: Props) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultMember | null>(null);

  const { data: bundleDetails, isPending } = useGetAgentVaultAccessBundle(accessBundle?.id ?? "");
  const removeMember = useRemoveAgentVaultAccessBundleMember();

  const members = bundleDetails?.members ?? [];
  const memberToRemoveName = memberToRemove ? memberDisplayName(memberToRemove) : "";

  const handleRemove = async () => {
    try {
      if (!accessBundle || !memberToRemove) return;

      await removeMember.mutateAsync({
        accessBundleId: accessBundle.id,
        memberId: memberToRemove.id
      });
      createNotification({
        text: `Access bundle revoked from "${memberToRemoveName}"`,
        type: "success"
      });
      setMemberToRemove(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Sheet open={Boolean(accessBundle)} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle>Manage Access</SheetTitle>
          <SheetDescription>Who can mint a session over {accessBundle?.name}.</SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-center justify-end">
            <Button size="sm" variant="av" onClick={() => setIsAddOpen(true)}>
              <UserPlusIcon />
              Grant Access
            </Button>
          </div>

          {isPending && <Skeleton className="h-16 w-full" />}

          {!isPending && members.length === 0 && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No members yet</EmptyTitle>
                <EmptyDescription>
                  Grant this bundle to a user, machine identity or group.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isPending && members.length > 0 && (
            <Table className="overflow-hidden rounded-md border border-border">
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
                            <BanIcon />
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

        <AlertDialog
          open={Boolean(memberToRemove)}
          onOpenChange={(isOpen) => {
            if (!isOpen && !removeMember.isPending) setMemberToRemove(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Revoke access for &quot;{memberToRemoveName}&quot;
              </AlertDialogTitle>
              <AlertDialogDescription>
                They lose this bundle, and any live session they hold stops reaching its hosts at
                the next proxy poll.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={removeMember.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                isPending={removeMember.isPending}
                onClick={async (event) => {
                  event.preventDefault();
                  await handleRemove();
                }}
              >
                Revoke Access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
};
