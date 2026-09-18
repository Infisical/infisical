import { useState } from "react";
import { format } from "date-fns";
import { BanIcon, MoreHorizontalIcon, SearchIcon, UserPlusIcon } from "lucide-react";

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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
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
import { actorIdsPayload } from "@app/helpers/agentVaultMembers";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  useListAgentVaultAccessBundleMembers,
  useRevokeAgentVaultAccessBundleMembers
} from "@app/hooks/api/agentVault";
import { TAgentVaultMember } from "@app/hooks/api/agentVault/types";

import { GrantAccessDialog } from "./GrantAccessDialog";
import { memberDisplayName, MemberName } from "./MemberName";

type Props = {
  accessBundle: { id: string; name: string } | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ManageAccessSheet = ({ accessBundle, onOpenChange }: Props) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultMember | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  // Ten rather than twenty: the sheet is 640px wide and sits inside a scroll container.
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultAccessBundleMembersTable", PreferenceKey.PerPage, 10)
  );

  const { data, isPending } = useListAgentVaultAccessBundleMembers(accessBundle?.id ?? "", {
    search: debouncedSearch.trim() || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const revokeMembers = useRevokeAgentVaultAccessBundleMembers();

  const members = data?.members ?? [];
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  // The debounced term, not the typed one: the rows on screen were fetched with this, so keying the
  // copy off the live input would caption a stale result set.
  const isFiltered = Boolean(debouncedSearch.trim());
  const memberToRemoveName = memberToRemove ? memberDisplayName(memberToRemove.actor) : "";

  const handleRemove = async () => {
    try {
      if (!accessBundle || !memberToRemove) return;

      await revokeMembers.mutateAsync({
        accessBundleId: accessBundle.id,
        ...actorIdsPayload([memberToRemove.actor])
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
          <SheetDescription>
            Manage who can create sessions with {accessBundle?.name}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-center gap-2">
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search members..."
              />
            </InputGroup>
            <Button size="sm" variant="av" onClick={() => setIsAddOpen(true)}>
              <UserPlusIcon />
              Grant Access
            </Button>
          </div>

          {isPending && <Skeleton className="h-16 w-full" />}

          {!isPending && members.length === 0 && (
            <Empty className="flex-none border">
              <EmptyHeader>
                <EmptyTitle>
                  {isFiltered ? "No members match your search" : "No members yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {isFiltered
                    ? "Try a different search term."
                    : "Grant this bundle to a user, machine identity, or group."}
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
                            aria-label={`Actions for ${memberDisplayName(member.actor)}`}
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

          {totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={(newPerPage) => {
                setPerPage(newPerPage);
                setPage(1);
                setUserTablePreference(
                  "agentVaultAccessBundleMembersTable",
                  PreferenceKey.PerPage,
                  newPerPage
                );
              }}
            />
          )}
        </div>

        {accessBundle && (
          <GrantAccessDialog
            isOpen={isAddOpen}
            onOpenChange={setIsAddOpen}
            accessBundleId={accessBundle.id}
          />
        )}

        <AlertDialog
          open={Boolean(memberToRemove)}
          onOpenChange={(isOpen) => {
            if (!isOpen && !revokeMembers.isPending) setMemberToRemove(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Revoke Access for &quot;{memberToRemoveName}&quot;
              </AlertDialogTitle>
              <AlertDialogDescription>
                They lose this access bundle. Any active session they hold stops reaching its hosts
                at the next proxy poll.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={revokeMembers.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                isPending={revokeMembers.isPending}
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
