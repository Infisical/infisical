import { useMemo, useState } from "react";
import { format } from "date-fns";
import { SearchIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultMember | null>(null);

  const { data: bundleDetails, isPending } = useGetAgentVaultAccessBundle(accessBundle?.id ?? "");
  const removeMember = useRemoveAgentVaultAccessBundleMember();

  const members = bundleDetails?.members ?? [];
  const displayedMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => memberDisplayName(member).toLowerCase().includes(term));
  }, [members, search]);

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
    <Sheet
      open={Boolean(accessBundle)}
      onOpenChange={(isOpen) => {
        if (!isOpen) setSearch("");
        onOpenChange(isOpen);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Manage Access</SheetTitle>
          <SheetDescription>
            Who can mint a session over {accessBundle?.name}. Revoking takes effect at the next
            proxy poll.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {members.length > 0 && (
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members..."
              />
            </InputGroup>
          )}

          {isPending && <Skeleton className="h-16 w-full" />}

          {!isPending && displayedMembers.length === 0 && (
            <Empty className="border" frame="dashed">
              <EmptyHeader>
                <EmptyTitle>
                  {members.length === 0 ? "No members yet" : "No members match your search"}
                </EmptyTitle>
                <EmptyDescription>
                  {members.length === 0
                    ? "Grant this bundle to a user, machine identity or group."
                    : "Try a different search term."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isPending && displayedMembers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedMembers.map((member) => (
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
        </div>

        <SheetFooter className="border-t">
          <Button variant="av" onClick={() => setIsAddOpen(true)}>
            Grant Access
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>

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
