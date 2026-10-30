import { useEffect, useRef, useState } from "react";
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
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
const ALL_TYPES = "all";

const TYPE_OPTIONS = [
  { value: AgentVaultMemberType.User, label: "Users" },
  { value: AgentVaultMemberType.Group, label: "Groups" },
  { value: AgentVaultMemberType.MachineIdentity, label: "Machine Identities" }
].map((option) => ({ ...option, icon: MEMBER_KIND[option.value].icon }));

const MemberTypeFilter = ({
  value,
  onChange
}: {
  value: AgentVaultMemberType | null;
  onChange: (value: AgentVaultMemberType | null) => void;
}) => (
  <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label="Filter members" size="md" variant={value ? "av" : "outline"}>
            <FilterIcon />
          </IconButton>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>Filter members</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="w-60">
      <DropdownMenuLabel>Type</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value ?? ALL_TYPES}
        onValueChange={(next) =>
          onChange(next === ALL_TYPES ? null : (next as AgentVaultMemberType))
        }
      >
        <DropdownMenuRadioItem value={ALL_TYPES}>
          <UsersIcon />
          All Types
        </DropdownMenuRadioItem>
        {TYPE_OPTIONS.map((option) => (
          <DropdownMenuRadioItem key={option.value} value={option.value}>
            <option.icon />
            {option.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
);

type TAccessBundle = { id: string; name: string };

const ManageAccessContent = ({
  accessBundle,
  isOpen
}: {
  accessBundle: TAccessBundle;
  isOpen: boolean;
}) => {
  const [memberToRemove, setMemberToRemove] = useState<TAgentVaultMember | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<AgentVaultMemberType | null>(null);
  const [noAccessSection, setNoAccessSection] = useState("");
  const hasPickedInitialSection = useRef(false);

  const searchParam = debouncedSearch.trim() || undefined;
  const actorType = typeFilter ?? undefined;

  const {
    data,
    isPending: isMembersPending,
    isPlaceholderData: isMembersPlaceholder
  } = useListAgentVaultAccessBundleMembers(accessBundle.id, {
    actorType,
    search: searchParam,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE
  });
  const {
    data: available,
    isPending: isAvailablePending,
    isPlaceholderData: isAvailablePlaceholder,
    isError: isAvailableError,
    isFetching: isAvailableFetching
  } = useListAvailableAgentVaultAccessBundleMembers(
    accessBundle.id,
    { actorType, search: searchParam, limit: AVAILABLE_PREVIEW_LIMIT },
    isOpen
  );
  const addMembers = useAddAgentVaultAccessBundleMembers();
  const revokeMembers = useRevokeAgentVaultAccessBundleMembers();

  // Both lists keep the previous result while a new filter loads, so rows of the previous type are hidden
  // here, and a list that hides everything reads as loading rather than empty.
  const matchesType = (type: AgentVaultMemberType) => !typeFilter || type === typeFilter;
  const members = (data?.members ?? []).filter((member) => matchesType(member.type));
  const totalCount = data?.totalCount ?? 0;
  const candidates = (available?.members ?? []).filter((member) => matchesType(member.type));
  const candidateCount = available?.totalCount ?? 0;
  const isPending = isMembersPending || (isMembersPlaceholder && !members.length);
  const isAvailableLoading = isAvailablePending || (isAvailablePlaceholder && !candidates.length);
  useResetPageHelper({ totalCount, offset: (page - 1) * PER_PAGE, setPage });

  // A bundle no one holds yet has nothing above the fold, so the grant list starts open. This content
  // remounts per bundle, so the first settled result is always this bundle's own.
  useEffect(() => {
    if (isPending || hasPickedInitialSection.current) return;
    hasPickedInitialSection.current = true;
    if (!totalCount) setNoAccessSection(NO_ACCESS_SECTION);
  }, [isPending, totalCount]);

  const isFiltered = Boolean(searchParam || typeFilter);
  const isAvailableSettled = !isAvailableLoading && !isAvailableError;
  const isSearchMiss = Boolean(searchParam) && !totalCount && isAvailableSettled && !candidateCount;
  // a granted candidate stays in this list until the refetch lands
  const isGrantLocked = addMembers.isPending || isAvailableFetching;
  const memberToRemoveName = memberToRemove ? memberDisplayName(memberToRemove) : "";

  const emptyState = typeFilter
    ? {
        title: "No matching access",
        description: `No ${TYPE_OPTIONS.find((option) => option.value === typeFilter)?.label.toLowerCase()} have access to this bundle. Clear the filter, or grant access from the No Access section.`
      }
    : {
        title: "No one has access yet",
        description:
          "Grant access from the No Access section to let members create sessions with this bundle."
      };

  const changeFilter = (next: AgentVaultMemberType | null) => {
    setTypeFilter(next);
    setPage(1);
  };

  const handleGrant = async (member: TAgentVaultProductActor) => {
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
      if (!memberToRemove) return;

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

  const renderCandidates = () => {
    if (isAvailableLoading) {
      return (
        <div className="space-y-2 py-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      );
    }
    if (isAvailableError) {
      return (
        <p className="py-2.5 text-xs text-danger">
          Could not load the members without access. Close this panel and open it again to retry.
        </p>
      );
    }
    if (!candidates.length) {
      if (isSearchMiss) return null;
      return (
        <p className="py-2.5 text-xs text-muted">
          {isFiltered
            ? "No members without access match your search and filters."
            : "Everyone in Agent Vault already has this bundle."}
        </p>
      );
    }
    return (
      <>
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
        {candidateCount > candidates.length && (
          <p className="py-2.5 text-xs text-muted">
            Showing the first {AVAILABLE_PREVIEW_LIMIT} of {candidateCount}. Search to find someone
            else.
          </p>
        )}
      </>
    );
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Manage Access
          <DocumentationLinkBadge href={AgentVaultDocsUrls.accessBundles} />
        </SheetTitle>
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-neutral/5 px-3 py-2 text-xs">
          <PackageIcon className="size-3.5 shrink-0 text-muted" />
          <span className="truncate text-foreground">{accessBundle.name}</span>
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
          <MemberTypeFilter value={typeFilter} onChange={changeFilter} />
        </div>

        {isPending && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!isPending && !members.length && !searchParam && (
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
              <AccordionContent>{renderCandidates()}</AccordionContent>
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
        onOpenChange={(open) => {
          if (!open && !revokeMembers.isPending) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access for &quot;{memberToRemoveName}&quot;</AlertDialogTitle>
            <AlertDialogDescription>
              They lose this access bundle. Any active session they hold stops reaching its hosts at
              the next proxy poll.
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
    </>
  );
};

type Props = {
  accessBundle: TAccessBundle | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ManageAccessSheet = ({ accessBundle, onOpenChange }: Props) => {
  // Holds the last bundle so the content stays on screen while the sheet animates closed.
  const [shownBundle, setShownBundle] = useState(accessBundle);
  if (
    accessBundle &&
    (accessBundle.id !== shownBundle?.id || accessBundle.name !== shownBundle?.name)
  ) {
    setShownBundle(accessBundle);
  }

  // Keyed per bundle so a second bundle starts with fresh state and queries, rather than showing the
  // previous bundle's results while its own load.
  return (
    <Sheet open={Boolean(accessBundle)} onOpenChange={onOpenChange}>
      <SheetContent className="gap-y-0 sm:max-w-[640px]">
        {shownBundle && (
          <ManageAccessContent
            key={shownBundle.id}
            accessBundle={shownBundle}
            isOpen={Boolean(accessBundle)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
