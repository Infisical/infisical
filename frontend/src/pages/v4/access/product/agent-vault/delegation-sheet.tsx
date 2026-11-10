import { useState } from "react";
import { Trash2Icon, UsersRoundIcon } from "lucide-react";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Alert } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { Heading } from "@app/components/v4/ui/text";
import { AgentVaultDelegationScope, AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";

import { useV4Adapter } from "../../../data/adapters";
import { useDebounced } from "../../org/use-debounced";
import { useProjectScope } from "../../project/scope";
import { formatDate } from "../../roles";
import { failed, saved } from "../../toast";
import { Muted } from "../../ui";
import {
  DELEGATION_DOCS_URL,
  MissingAccessBundlesHint,
  SubjectName,
  delegationSubjects,
  subjectOnBehalfOf,
  type DelegationSubject
} from "./delegation-common";
import { memberDisplayName } from "./shared";

const CANDIDATE_LIMIT = 20;
const TYPE_FIELD = "type";

type Identity = { id: string; name: string };
type Change =
  | { kind: "remove"; subject: DelegationSubject }
  | { kind: "all-members-on" }
  | { kind: "all-members-off" };

const Content = ({ identity }: { identity: Identity }) => {
  const { projectId } = useProjectScope();
  const av = useV4Adapter("agentVault");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [change, setChange] = useState<Change>();

  const typeValues = filters.find((filter) => filter.field === TYPE_FIELD)?.values ?? [];
  const typeFilter =
    typeValues.length === 1
      ? (typeValues[0] as AgentVaultMemberType.User | AgentVaultMemberType.Group)
      : undefined;

  const delegationQuery = av.useDelegation(projectId, identity.id);
  const delegation = delegationQuery.data ?? null;
  const isAllMembers = delegation?.scope === AgentVaultDelegationScope.AllMembers;
  const available = av.useAvailableDelegationSubjects(
    projectId,
    identity.id,
    { actorType: typeFilter, search: debouncedSearch || undefined, limit: CANDIDATE_LIMIT },
    !isAllMembers
  );
  const setDelegation = av.useSetDelegation(projectId);
  const deleteDelegation = av.useDeleteDelegation(projectId);
  const addSubjects = av.useAddDelegationSubjects(projectId);
  const removeSubjects = av.useRemoveDelegationSubjects(projectId);
  const changing =
    setDelegation.isPending ||
    deleteDelegation.isPending ||
    addSubjects.isPending ||
    removeSubjects.isPending;

  const needle = debouncedSearch.toLowerCase();
  const subjects = delegationSubjects(delegation);
  const shown = subjects.filter(
    (subject) =>
      (!typeFilter || subject.type === typeFilter) &&
      (!needle || `${subject.name} ${subject.subtitle}`.toLowerCase().includes(needle))
  );
  const candidates = (available.data?.members ?? []).filter(
    (member) =>
      member.type !== AgentVaultMemberType.MachineIdentity &&
      (!typeFilter || member.type === typeFilter)
  );
  const candidateCount = available.data?.totalCount ?? 0;
  const searching = Boolean(debouncedSearch || typeFilter);

  const add = async (member: (typeof candidates)[number]) => {
    const name = memberDisplayName(member);
    try {
      await addSubjects.mutateAsync({
        machineIdentityId: identity.id,
        ...(member.type === AgentVaultMemberType.User
          ? { userIds: [member.id] }
          : { groupIds: [member.id] })
      });
      saved(`${name} added to the delegation`);
    } catch (error) {
      failed("Failed to add to the delegation", error);
    }
  };

  const apply = async () => {
    if (!change) return;
    try {
      if (change.kind === "all-members-on") {
        await setDelegation.mutateAsync({
          machineIdentityId: identity.id,
          scope: AgentVaultDelegationScope.AllMembers
        });
        saved(`${identity.name} now acts on behalf of every project member`);
      } else if (change.kind === "all-members-off") {
        await deleteDelegation.mutateAsync({ machineIdentityId: identity.id });
        saved(`Delegation for ${identity.name} removed`);
      } else {
        const { subject } = change;
        const remaining = await removeSubjects.mutateAsync({
          machineIdentityId: identity.id,
          ...(subject.type === AgentVaultMemberType.User
            ? { userIds: [subject.id] }
            : { groupIds: [subject.id] })
        });
        saved(
          remaining
            ? `${subject.name} removed from the delegation`
            : `${subject.name} removed, which removes the delegation for ${identity.name}`
        );
      }
      setChange(undefined);
    } catch (error) {
      failed("Failed to update the delegation", error);
    }
  };

  let copy = { title: "", description: "", action: "" };
  if (change?.kind === "all-members-on")
    copy = {
      title: "Act on behalf of all members?",
      description: `${identity.name} can start sessions on behalf of every project member, including project admins and users added later. ${subjects.length ? "This replaces the users and groups listed now. " : ""}Anyone who can log in as this machine identity can use their personal values.`,
      action: "Allow all members"
    };
  else if (change?.kind === "all-members-off")
    copy = {
      title: "Stop acting on behalf of all members?",
      description: `${identity.name} can no longer start sessions on behalf of anyone until you add users or groups, and the sessions it started stop working at the next proxy poll.`,
      action: "Stop"
    };
  else if (change)
    copy = {
      title: `Remove ${change.subject.name} from the delegation?`,
      description: `${identity.name} can no longer start sessions on behalf of ${subjectOnBehalfOf(change.subject)}, and the sessions it started for them stop working at the next proxy poll.${subjects.length === 1 ? " This is the last user or group, so the delegation is removed." : ""}`,
      action: "Remove"
    };

  const inDelegationColumns: DataTableColumn<DelegationSubject>[] = [
    {
      id: "subject",
      header: "User or group",
      grow: true,
      render: (subject) => <SubjectName name={subject.name} subtitle={subject.subtitle} />
    },
    {
      id: "added",
      header: "Added",
      render: (subject) => <span>{formatDate(subject.addedAt)}</span>
    },
    {
      id: "excluded",
      header: "Excluded bundles",
      render: (subject) => (
        <MissingAccessBundlesHint
          bundles={subject.missingAccessBundles}
          machineIdentityName={identity.name}
          onBehalfOf={subjectOnBehalfOf(subject)}
        />
      )
    }
  ];

  const candidateColumns: DataTableColumn<(typeof candidates)[number]>[] = [
    {
      id: "subject",
      header: "User or group",
      grow: true,
      render: (member) => (
        <SubjectName
          name={memberDisplayName(member)}
          subtitle={
            member.type === AgentVaultMemberType.User ? member.email || member.username : "Group"
          }
        />
      )
    },
    {
      id: "add",
      header: "",
      render: (member) => (
        <Button
          variant="outline"
          size="sm"
          disabled={changing}
          aria-label={`Add ${memberDisplayName(member)} to the delegation`}
          onClick={() => add(member)}
        >
          Add
        </Button>
      )
    }
  ];

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          <Inline gap={8}>
            Manage delegation
            <DocumentationLinkBadge href={DELEGATION_DOCS_URL} />
          </Inline>
        </SheetTitle>
      </SheetHeader>
      <SheetBody>
        <Stack gap={24}>
          <Switch
            layout="row"
            label="All project members"
            description="Act on behalf of every user in this project, including admins and users added later."
            checked={isAllMembers}
            disabled={delegationQuery.isPending || changing}
            onChange={(checked) =>
              setChange({ kind: checked ? "all-members-on" : "all-members-off" })
            }
          />
          {isAllMembers && delegation && (
            <Alert>
              <Inline gap={8}>
                <Icon icon={UsersRoundIcon} size={14} />
                Every project member is covered. Turn this off to pick users and groups instead.
                <MissingAccessBundlesHint
                  bundles={delegation.missingAccessBundles}
                  machineIdentityName={identity.name}
                  onBehalfOf="project members"
                />
              </Inline>
            </Alert>
          )}
          {!isAllMembers && (
            <>
              <FilterBar
                label="Delegation filters"
                fields={[
                  {
                    key: TYPE_FIELD,
                    label: "Type",
                    type: "multi-select",
                    options: [
                      { value: AgentVaultMemberType.User, label: "Users" },
                      { value: AgentVaultMemberType.Group, label: "Groups" }
                    ]
                  }
                ]}
                value={filters}
                onChange={setFilters}
                search={
                  <Input
                    icon="search"
                    aria-label="Search users and groups..."
                    placeholder="Search users and groups..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                }
              />
              <Stack gap={8}>
                <Heading level={3} size="subsection">
                  In delegation
                </Heading>
                <DataTable
                  label="In delegation"
                  rows={shown}
                  columns={inDelegationColumns}
                  rowActions={{
                    renderMenu: (subject) => (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setChange({ kind: "remove", subject })}
                      >
                        <Icon icon={Trash2Icon} />
                        Remove
                      </DropdownMenuItem>
                    )
                  }}
                  getRowId={(subject) => subject.key}
                  rowLabel={(subject) => subject.name}
                  loading={delegationQuery.isPending}
                  loadingRows={3}
                  empty={
                    searching ? (
                      <EmptyState size="sm" icon="search" title="No users or groups match search" />
                    ) : (
                      <EmptyState size="sm" icon="user" title="No users or groups yet" />
                    )
                  }
                />
              </Stack>
              <Stack gap={8}>
                <Heading level={3} size="subsection">
                  Not in delegation
                </Heading>
                <DataTable
                  label="Not in delegation"
                  rows={candidates}
                  columns={candidateColumns}
                  getRowId={(member) => `${member.type}:${member.id}`}
                  rowLabel={memberDisplayName}
                  loading={available.isPending}
                  loadingRows={3}
                  empty={
                    <EmptyState
                      size="sm"
                      icon={searching ? "search" : "user"}
                      title={
                        searching
                          ? "No users or groups outside the delegation match search"
                          : "Every user and group in this project is already in the delegation"
                      }
                    />
                  }
                />
                {candidateCount > candidates.length && (
                  <Muted>
                    {`Showing the first ${CANDIDATE_LIMIT} of ${candidateCount}. Search to find someone else.`}
                  </Muted>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Muted>Changes save automatically</Muted>
      </SheetFooter>
      <AlertDialog
        open={Boolean(change)}
        onOpenChange={(open) => !open && !changing && setChange(undefined)}
      >
        <AlertDialogContent
          tone={change?.kind === "all-members-on" ? "neutral" : "danger"}
          pending={changing}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={change?.kind === "all-members-on" ? "primary" : "destructive"}
              onClick={(event) => {
                event.preventDefault();
                apply();
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

export const ManageDelegationSheet = ({
  machineIdentity,
  onOpenChange
}: {
  machineIdentity?: Identity;
  onOpenChange: (open: boolean) => void;
}) => {
  const [shown, setShown] = useState(machineIdentity);
  if (machineIdentity && (machineIdentity.id !== shown?.id || machineIdentity.name !== shown?.name))
    setShown(machineIdentity);

  return (
    <Sheet open={Boolean(machineIdentity)} onOpenChange={onOpenChange}>
      <SheetContent size="md">{shown && <Content key={shown.id} identity={shown} />}</SheetContent>
    </Sheet>
  );
};
