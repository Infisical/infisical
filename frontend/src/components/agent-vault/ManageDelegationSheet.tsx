import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ChevronDownIcon,
  FilterIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
  UsersRoundIcon,
  XIcon
} from "lucide-react";

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
  Button,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Separator,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  useAddAgentVaultDelegationSubjects,
  useDeleteAgentVaultDelegation,
  useGetAgentVaultDelegation,
  useListAvailableAgentVaultDelegationSubjects,
  useRemoveAgentVaultDelegationSubjects,
  useSetAgentVaultDelegation
} from "@app/hooks/api/agentVault";
import { AgentVaultDelegationScope, AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import {
  TAgentVaultActor,
  TAgentVaultMissingAccessBundle,
  TAgentVaultProductMember
} from "@app/hooks/api/agentVault/types";
import { AgentVaultDocsUrls } from "@app/pages/agent-vault/agent-vault-docs-urls";

import { MEMBER_KIND, memberDisplayName, memberSubtitle } from "./MemberName";
import { MissingAccessBundlesHint } from "./MissingAccessBundlesHint";
import { PendingInvitationBadge } from "./PendingInvitationBadge";

// users and groups not in the delegation aren't paged, so the list is capped and search narrows it
const AVAILABLE_PREVIEW_LIMIT = 20;
const NOT_IN_DELEGATION_SECTION = "not-in-delegation";
const ALL_TYPES = "all";
const ROW_CLASS_NAME = "flex items-center gap-3 py-3";

type TSubjectType = AgentVaultMemberType.User | AgentVaultMemberType.Group;

const TYPE_OPTIONS = [
  { value: AgentVaultMemberType.User as TSubjectType, label: "Users" },
  { value: AgentVaultMemberType.Group as TSubjectType, label: "Groups" }
].map((option) => ({ ...option, icon: MEMBER_KIND[option.value].icon }));

export type TDelegationSubjectRow = TAgentVaultActor & {
  addedAt: string;
  missingAccessBundles: TAgentVaultMissingAccessBundle[];
};

const initialsOf = (value: string) =>
  value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const SubjectIdentity = ({
  member,
  badge
}: {
  member: TAgentVaultActor;
  badge?: React.ReactNode;
}) => {
  const name = memberDisplayName(member);
  const { label, icon: Icon } = MEMBER_KIND[member.type];

  return (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-neutral/10 text-xs font-semibold text-accent">
        {member.type === AgentVaultMemberType.User ? initialsOf(name) : <Icon className="size-4" />}
        <span className="sr-only">{label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {badge}
        </div>
        <p className="truncate text-xs text-muted">{memberSubtitle(member)}</p>
      </div>
    </>
  );
};

const SubjectTypeFilter = ({
  value,
  onChange
}: {
  value: TSubjectType | null;
  onChange: (value: TSubjectType | null) => void;
}) => (
  <DropdownMenu>
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-label="Filter users and groups"
            size="md"
            variant={value ? "av" : "outline"}
          >
            <FilterIcon />
          </IconButton>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>Filter users and groups</TooltipContent>
    </Tooltip>
    <DropdownMenuContent align="end" className="w-60">
      <DropdownMenuLabel>Type</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={value ?? ALL_TYPES}
        onValueChange={(next) => onChange(next === ALL_TYPES ? null : (next as TSubjectType))}
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

const matchesSearch = (member: TAgentVaultActor, search: string) => {
  if (!search) return true;
  const term = search.toLowerCase();
  return [memberDisplayName(member), memberSubtitle(member)].some((value) =>
    value.toLowerCase().includes(term)
  );
};

type TPendingChange =
  | { kind: "remove"; subject: TDelegationSubjectRow }
  | { kind: "all-members-on" }
  | { kind: "all-members-off" };

type TIdentity = { id: string; name: string };

const ManageDelegationContent = ({
  identity,
  isOpen
}: {
  identity: TIdentity;
  isOpen: boolean;
}) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [typeFilter, setTypeFilter] = useState<TSubjectType | null>(null);
  const [notInDelegationSection, setNotInDelegationSection] = useState("");
  const [pendingChange, setPendingChange] = useState<TPendingChange | null>(null);
  const hasPickedInitialSection = useRef(false);

  const searchParam = debouncedSearch.trim() || undefined;
  const { data, isPending } = useGetAgentVaultDelegation(identity.id, isOpen);
  const delegation = data ?? null;
  const isAllMembers = delegation?.scope === AgentVaultDelegationScope.AllMembers;

  const {
    data: available,
    isPending: isAvailablePending,
    isPlaceholderData: isAvailablePlaceholder,
    isError: isAvailableError,
    isFetching: isAvailableFetching
  } = useListAvailableAgentVaultDelegationSubjects(
    identity.id,
    { actorType: typeFilter ?? undefined, search: searchParam, limit: AVAILABLE_PREVIEW_LIMIT },
    isOpen && !isAllMembers
  );

  const setDelegation = useSetAgentVaultDelegation();
  const deleteDelegation = useDeleteAgentVaultDelegation();
  const addSubjects = useAddAgentVaultDelegationSubjects();
  const removeSubjects = useRemoveAgentVaultDelegationSubjects();
  // Every write's response replaces the cached delegation, so one at a time keeps a slower earlier
  // response from overwriting a later one.
  const isChanging =
    setDelegation.isPending ||
    deleteDelegation.isPending ||
    removeSubjects.isPending ||
    addSubjects.isPending;

  const subjects: TDelegationSubjectRow[] = [
    ...(delegation?.groups ?? []).map((group) => ({
      type: AgentVaultMemberType.Group as const,
      ...group
    })),
    ...(delegation?.users ?? []).map((user) => ({
      type: AgentVaultMemberType.User as const,
      ...user
    }))
  ];
  // The delegation is read whole, so search and the type filter narrow it here.
  const shownSubjects = subjects.filter(
    (subject) =>
      (!typeFilter || subject.type === typeFilter) && matchesSearch(subject, searchParam ?? "")
  );

  // The candidate list keeps the previous result while a new filter loads, so rows of the previous type
  // are hidden here, and a list that hides everything reads as loading rather than empty.
  const candidates = (available?.members ?? []).filter(
    (member): member is TAgentVaultProductMember & { type: TSubjectType } =>
      member.type !== AgentVaultMemberType.MachineIdentity &&
      (!typeFilter || member.type === typeFilter)
  );
  const candidateCount = available?.totalCount ?? 0;
  const isAvailableLoading = isAvailablePending || (isAvailablePlaceholder && !candidates.length);
  // an added candidate stays in this list until the refetch lands
  const isAddLocked = isChanging || isAvailableFetching;

  // A delegation that names no one has nothing above the fold, so the add list starts open. This
  // content remounts per identity, so the first settled result is always this identity's own.
  useEffect(() => {
    if (isPending || hasPickedInitialSection.current) return;
    hasPickedInitialSection.current = true;
    if (!subjects.length) setNotInDelegationSection(NOT_IN_DELEGATION_SECTION);
  }, [isPending, subjects.length]);

  const isFiltered = Boolean(searchParam || typeFilter);
  const isSearchMiss =
    isFiltered &&
    !shownSubjects.length &&
    !isAvailableLoading &&
    !isAvailableError &&
    !candidateCount;

  const handleAdd = async (member: TAgentVaultProductMember & { type: TSubjectType }) => {
    const name = memberDisplayName(member);
    try {
      await addSubjects.mutateAsync({
        machineIdentityId: identity.id,
        ...(member.type === AgentVaultMemberType.User
          ? { userIds: [member.id] }
          : { groupIds: [member.id] })
      });
      createNotification({ text: `"${name}" added to the delegation`, type: "success" });
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const applyPendingChange = async () => {
    if (!pendingChange) return;
    try {
      if (pendingChange.kind === "all-members-on") {
        await setDelegation.mutateAsync({
          machineIdentityId: identity.id,
          scope: AgentVaultDelegationScope.AllMembers
        });
        createNotification({
          text: `"${identity.name}" now acts on behalf of every Agent Vault member`,
          type: "success"
        });
      } else if (pendingChange.kind === "all-members-off") {
        await deleteDelegation.mutateAsync({ machineIdentityId: identity.id });
        createNotification({
          text: `Delegation for "${identity.name}" removed`,
          type: "success"
        });
        setNotInDelegationSection(NOT_IN_DELEGATION_SECTION);
      } else {
        const { subject } = pendingChange;
        const remaining = await removeSubjects.mutateAsync({
          machineIdentityId: identity.id,
          ...(subject.type === AgentVaultMemberType.User
            ? { userIds: [subject.id] }
            : { groupIds: [subject.id] })
        });
        createNotification({
          text: remaining
            ? `"${memberDisplayName(subject)}" removed from the delegation`
            : `"${memberDisplayName(subject)}" removed, which removes the delegation for "${identity.name}"`,
          type: "success"
        });
      }
      setPendingChange(null);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  const pendingCopy = () => {
    if (!pendingChange) return { title: "", description: "", action: "" };
    if (pendingChange.kind === "all-members-on") {
      return {
        title: "Act on Behalf of All Members",
        description: `"${identity.name}" can start sessions on behalf of every Agent Vault member, including Agent Vault admins and users added later. ${
          subjects.length ? "This replaces the users and groups listed now. " : ""
        }Anyone who can log in as this machine identity can use their personal values.`,
        action: "Allow All Members"
      };
    }
    if (pendingChange.kind === "all-members-off") {
      return {
        title: "Stop Acting on Behalf of All Members",
        description: `"${identity.name}" can no longer start sessions on behalf of anyone until you add users or groups, and the sessions it started stop working at the next proxy poll.`,
        action: "Stop"
      };
    }
    const { subject } = pendingChange;
    const name = memberDisplayName(subject);
    const whose =
      subject.type === AgentVaultMemberType.Group ? `the members of "${name}"` : `"${name}"`;
    return {
      title: `Remove "${name}" From the Delegation`,
      description: `"${identity.name}" can no longer start sessions on behalf of ${whose}, and the sessions it started for them stop working at the next proxy poll.${
        subjects.length === 1
          ? " This is the last user or group, so the delegation is removed."
          : ""
      }`,
      action: "Remove"
    };
  };
  const copy = pendingCopy();

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
          Could not load the users and groups that can be added. Close this panel and open it again
          to retry.
        </p>
      );
    }
    if (!candidates.length) {
      if (isSearchMiss) return null;
      return (
        <p className="py-2.5 text-xs text-muted">
          {isFiltered
            ? "No users or groups outside the delegation match your search and filters."
            : "Every Agent Vault user and group is already in the delegation."}
        </p>
      );
    }
    return (
      <>
        <section className="flex flex-col">
          {candidates.map((member) => (
            <div key={`${member.type}:${member.id}`} className={ROW_CLASS_NAME}>
              <SubjectIdentity
                member={member}
                badge={
                  <PendingInvitationBadge
                    isPending={
                      member.type === AgentVaultMemberType.User && member.isOrgMembershipPending
                    }
                  />
                }
              />
              <Button
                variant="av"
                size="sm"
                className="shrink-0"
                isDisabled={isAddLocked}
                aria-label={`Add ${memberDisplayName(member)} to the delegation`}
                onClick={() => handleAdd(member)}
              >
                Add
              </Button>
            </div>
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

  const renderSubjects = () => {
    if (!subjects.length && !isFiltered) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No users or groups yet</EmptyTitle>
            <EmptyDescription>
              Add users and groups from the Not in Delegation section to let this machine identity
              start sessions on their behalf.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    if (!shownSubjects.length) return null;
    return (
      <section className="flex flex-col">
        {shownSubjects.map((subject) => (
          <div key={`${subject.type}:${subject.id}`} className={ROW_CLASS_NAME}>
            <SubjectIdentity member={subject} />
            <MissingAccessBundlesHint
              bundles={subject.missingAccessBundles}
              machineIdentityName={identity.name}
              onBehalfOf={
                subject.type === AgentVaultMemberType.Group
                  ? `members of "${memberDisplayName(subject)}"`
                  : `"${memberDisplayName(subject)}"`
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0"
                  aria-label={`In Delegation: ${memberDisplayName(subject)}`}
                >
                  In Delegation
                  <ChevronDownIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  Added {format(new Date(subject.addedAt), "MMM d, yyyy")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="danger"
                  onClick={() => setPendingChange({ kind: "remove", subject })}
                >
                  <Trash2Icon />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </section>
    );
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          Manage Delegation
          <DocumentationLinkBadge href={AgentVaultDocsUrls.sessionsOnBehalfOfUsers} />
        </SheetTitle>
      </SheetHeader>

      <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
        <Field orientation="horizontal" className="rounded-md border border-border p-4">
          <FieldContent>
            <FieldTitle>All Agent Vault Members</FieldTitle>
            <FieldDescription>
              Act on behalf of every user in Agent Vault, including admins and users added later.
            </FieldDescription>
          </FieldContent>
          <Toggle
            id="agent-vault-delegation-all-members"
            variant="av"
            checked={isAllMembers}
            disabled={isPending || isChanging}
            onCheckedChange={(checked) =>
              setPendingChange({ kind: checked ? "all-members-on" : "all-members-off" })
            }
          />
        </Field>

        {isPending && (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!isPending && isAllMembers && (
          <div className="flex items-center gap-2.5 rounded-md border border-border px-4 py-3">
            <UsersRoundIcon className="size-4 shrink-0 text-muted" />
            <p className="min-w-0 flex-1 text-sm text-muted">
              Every Agent Vault member is covered. Turn this off to pick users and groups instead.
            </p>
            {delegation && (
              <MissingAccessBundlesHint
                bundles={delegation.missingAccessBundles}
                machineIdentityName={identity.name}
                onBehalfOf="Agent Vault members"
              />
            )}
          </div>
        )}

        {!isPending && !isAllMembers && (
          <>
            <div className="flex items-center gap-2">
              <InputGroup className="flex-1">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value.trim()) setNotInDelegationSection(NOT_IN_DELEGATION_SECTION);
                  }}
                  placeholder="Search users and groups..."
                />
                {search && (
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton aria-label="Clear search" onClick={() => setSearch("")}>
                      <XIcon />
                    </InputGroupButton>
                  </InputGroupAddon>
                )}
              </InputGroup>
              <SubjectTypeFilter value={typeFilter} onChange={setTypeFilter} />
            </div>

            {isSearchMiss && (
              <p className="text-sm text-muted">
                No users or groups match your search and filters.
              </p>
            )}

            {renderSubjects()}

            <Accordion
              type="single"
              collapsible
              variant="ghost"
              value={notInDelegationSection}
              onValueChange={setNotInDelegationSection}
            >
              <AccordionItem value={NOT_IN_DELEGATION_SECTION}>
                <AccordionTrigger>
                  <span className="shrink-0">Not in Delegation</span>
                  <span className="flex-1">
                    <Separator />
                  </span>
                </AccordionTrigger>
                <AccordionContent>{renderCandidates()}</AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </div>

      <SheetFooter className="border-t">
        <span className="text-xs text-muted">Changes save automatically</span>
      </SheetFooter>

      <AlertDialog
        open={Boolean(pendingChange)}
        onOpenChange={(open) => {
          if (!open && !isChanging) setPendingChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isChanging}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingChange?.kind === "all-members-on" ? "av" : "danger"}
              isPending={isChanging}
              onClick={async (event) => {
                event.preventDefault();
                await applyPendingChange();
              }}
            >
              {copy.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

type Props = {
  machineIdentity: TIdentity | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ManageDelegationSheet = ({ machineIdentity, onOpenChange }: Props) => {
  // Holds the last identity so the content stays on screen while the sheet animates closed.
  const [shownIdentity, setShownIdentity] = useState(machineIdentity);
  if (
    machineIdentity &&
    (machineIdentity.id !== shownIdentity?.id || machineIdentity.name !== shownIdentity?.name)
  ) {
    setShownIdentity(machineIdentity);
  }

  // Keyed per identity so another identity starts with fresh state rather than this one's filters.
  return (
    <Sheet open={Boolean(machineIdentity)} onOpenChange={onOpenChange}>
      <SheetContent className="gap-y-0 sm:max-w-[640px]">
        {shownIdentity && (
          <ManageDelegationContent
            key={shownIdentity.id}
            identity={shownIdentity}
            isOpen={Boolean(machineIdentity)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
