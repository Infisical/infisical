import { useEffect, useState } from "react";
import { FilterIcon, PackageIcon, SearchIcon, UsersIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Pagination,
  Separator,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { actorIdsPayload } from "@app/helpers/agentVaultMembers";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  useAddAgentVaultAccessBundleMembers,
  useListAgentVaultAccessBundleMembers,
  useListAvailableAgentVaultAccessBundleMembers,
  useRevokeAgentVaultAccessBundleMembers
} from "@app/hooks/api/agentVault";
import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultMember, TAgentVaultProductActor } from "@app/hooks/api/agentVault/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { AccessBundleGrantRow, AccessBundleMemberRow } from "./AccessBundleMemberRow";
import { MEMBER_KIND, memberDisplayName } from "./MemberName";

const PER_PAGE = 20;
// members without access are not paged, so the list is capped and search narrows it
const AVAILABLE_PREVIEW_LIMIT = 20;
const NO_ACCESS_SECTION = "no-access";

const TYPE_OPTIONS = [
  { value: AgentVaultMemberType.User, label: "Users" },
  { value: AgentVaultMemberType.Group, label: "Groups" },
  { value: AgentVaultMemberType.MachineIdentity, label: "Machine Identities" }
].map((option) => ({ ...option, icon: MEMBER_KIND[option.value].icon }));

const MemberTypeFilter = ({
  value,
  onChange
}: {
  value: AgentVaultMemberType[];
  onChange: (value: AgentVaultMemberType[]) => void;
}) => (
  <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-label="Filter members"
            size="md"
            variant={value.length ? "av" : "outline"}
          >
            <FilterIcon />
          </IconButton>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>Filter members</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="w-60">
      <DropdownMenuLabel>Type</DropdownMenuLabel>
      {TYPE_OPTIONS.map((option) => (
        <DropdownMenuCheckboxItem
          key={option.value}
          checked={value.includes(option.value)}
          onClick={(e) => {
            e.preventDefault();
            onChange(
              value.includes(option.value)
                ? value.filter((type) => type !== option.value)
                : [...value, option.value]
            );
          }}
        >
          <option.icon />
          {option.label}
        </DropdownMenuCheckboxItem>
      ))}
      {Boolean(value.length) && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onChange([])}>Clear Filters</DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

type Props = {
  accessBundle: { id: string; name: string } | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ManageAccessSheet = ({ accessBundle, onOpenChange }: Props) => {
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultMember | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<AgentVaultMemberType[]>([]);
  const [noAccessSection, setNoAccessSection] = useState("");

  const accessBundleId = accessBundle?.id ?? "";
  const searchParam = debouncedSearch.trim() || undefined;

  const { data, isPending } = useListAgentVaultAccessBundleMembers(accessBundleId, {
    search: searchParam,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE
  });
  const { data: available, isFetching: isAvailableFetching } =
    useListAvailableAgentVaultAccessBundleMembers(
      accessBundleId,
      { search: searchParam, limit: AVAILABLE_PREVIEW_LIMIT },
      Boolean(accessBundle)
    );
  const addMembers = useAddAgentVaultAccessBundleMembers();
  const revokeMembers = useRevokeAgentVaultAccessBundleMembers();

  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset: (page - 1) * PER_PAGE, setPage });

  // The sheet stays mounted between opens, so a second bundle would inherit the first one's state.
  useEffect(() => {
    setSearch("");
    setPage(1);
    setTypeFilter([]);
    setNoAccessSection("");
  }, [accessBundleId]);

  // A bundle no one holds yet has nothing above the fold, so the grant list starts open.
  useEffect(() => {
    if (!isPending && !totalCount && !searchParam) setNoAccessSection(NO_ACCESS_SECTION);
  }, [accessBundleId, isPending]);

  const matchesType = (type: AgentVaultMemberType) =>
    !typeFilter.length || typeFilter.includes(type);
  const members = (data?.members ?? []).filter((member) => matchesType(member.type));
  const candidates = (available?.members ?? []).filter((member) => matchesType(member.type));
  const hasMoreCandidates = (available?.totalCount ?? 0) > (available?.members.length ?? 0);

  const isSearching = Boolean(searchParam);
  const isSearchMiss = isSearching && !members.length && !candidates.length;
  // a granted candidate stays in this list until the refetch lands
  const isGrantLocked = addMembers.isPending || isAvailableFetching;
  const memberToRemoveName = memberToRemove ? memberDisplayName(memberToRemove) : "";

  const emptyState =
    typeFilter.length && totalCount > 0
      ? {
          title: "No matching access",
          description:
            "No one on this page matches these filters. Clear a filter, or check another page."
        }
      : {
          title: "No one has access yet",
          description:
            "Grant access from the No Access section to let members create sessions with this bundle."
        };

  const handleGrant = async (member: TAgentVaultProductActor) => {
    if (!accessBundle) return;
    const name = memberDisplayName(member);

    try {
      const { members: granted } = await addMembers.mutateAsync({
        accessBundleId: accessBundle.id,
        ...actorIdsPayload([member])
      });
      createNotification(
        granted.length
          ? { text: `Granted "${name}" access to ${accessBundle.name}`, type: "success" }
          : { text: `"${name}" already has this access bundle`, type: "info" }
      );
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const handleRemove = async () => {
    try {
      if (!accessBundle || !memberToRemove) return;

      await revokeMembers.mutateAsync({
        accessBundleId: accessBundle.id,
        ...actorIdsPayload([memberToRemove])
      });
      createNotification({
        text: `Revoked "${memberToRemoveName}" from ${accessBundle.name}`,
        type: "success"
      });
      setMemberToRemove(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Sheet open={Boolean(accessBundle)} onOpenChange={onOpenChange}>
      <SheetContent className="gap-y-0 sm:max-w-[640px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Manage Access
            <DocumentationLinkBadge href={AgentVaultDocsUrls.accessBundles} />
          </SheetTitle>
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-neutral/5 px-3 py-2 text-xs">
            <PackageIcon className="size-3.5 shrink-0 text-muted" />
            <span className="truncate text-foreground">{accessBundle?.name}</span>
          </div>
        </SheetHeader>

        <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
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
                  if (e.target.value.trim()) setNoAccessSection(NO_ACCESS_SECTION);
                }}
                placeholder="Search users, groups, and machine identities..."
              />
              {search && (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label="Clear search"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                  >
                    <XIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              )}
            </InputGroup>
            <MemberTypeFilter value={typeFilter} onChange={setTypeFilter} />
          </div>

          {isPending && (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          {!isPending && !members.length && !isSearching && (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>{emptyState.title}</EmptyTitle>
                <EmptyDescription>{emptyState.description}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isPending && isSearchMiss && (
            <p className="text-sm text-muted">No members match your search and filters.</p>
          )}

          {!isPending && Boolean(members.length) && (
            <section className="flex flex-col">
              {members.map((member) => (
                <AccessBundleMemberRow
                  key={`${member.type}:${member.id}`}
                  member={member}
                  onRevoke={() => setMemberToRemove(member)}
                />
              ))}
            </section>
          )}

          {!isPending && (
            <Accordion
              type="single"
              collapsible
              variant="ghost"
              value={noAccessSection}
              onValueChange={setNoAccessSection}
            >
              <AccordionItem value={NO_ACCESS_SECTION}>
                <AccordionTrigger>
                  <span className="shrink-0">No Access</span>
                  <span className="flex-1">
                    <Separator />
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {!candidates.length && !isSearchMiss && (
                    <p className="py-2.5 text-xs text-muted">
                      {isSearching || typeFilter.length
                        ? "No members without access match your search and filters."
                        : "Everyone in Agent Vault already has this bundle."}
                    </p>
                  )}
                  <section className="flex flex-col">
                    {candidates.map((member) => (
                      <AccessBundleGrantRow
                        key={`${member.type}:${member.id}`}
                        member={member}
                        isDisabled={isGrantLocked}
                        onGrant={() => handleGrant(member)}
                      />
                    ))}
                  </section>
                  {hasMoreCandidates && (
                    <p className="py-2.5 text-xs text-muted">
                      Showing the first {AVAILABLE_PREVIEW_LIMIT}. Search to find someone else.
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {!isPending && totalCount > PER_PAGE && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={PER_PAGE}
              onChangePage={setPage}
              onChangePerPage={() => {}}
              perPageList={[PER_PAGE]}
              startAdornment={<span className="text-xs text-muted">Members with access</span>}
            />
          )}
        </div>

        <SheetFooter className="border-t">
          <span className="text-xs text-muted">Changes save automatically</span>
        </SheetFooter>

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
