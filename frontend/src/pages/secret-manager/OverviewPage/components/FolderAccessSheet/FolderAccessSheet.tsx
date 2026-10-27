import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRightIcon,
  FolderIcon,
  LayersIcon,
  SearchIcon,
  UsersIcon,
  XIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  DocumentationLinkBadge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
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
  Skeleton
} from "@app/components/v3";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
} from "@app/context";
import { useDebounce } from "@app/hooks";
import {
  projectIdentityMembershipQuery,
  useAddUserToWsNonE2EE,
  useCreateProjectIdentityMembership,
  useGetOrgUsers,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import {
  SecretFolderRole,
  TFolderGrantType,
  useCreateIdentityFolderAccess,
  useCreateUserFolderAccess,
  useDeleteIdentityFolderAccess,
  useDeleteUserFolderAccess,
  useListFolderAccessIdentities,
  useListFolderAccessUsers,
  useUpdateIdentityFolderAccess,
  useUpdateUserFolderAccess
} from "@app/hooks/api/folderAccess";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { FOLDER_ROLE_TIER_LABELS } from "./folder-access.const";
import {
  byAdminThenName,
  byName,
  TFolderAccessActor,
  toIdentityActor,
  toOrgIdentityActor,
  toOrgUserActor,
  toUserActor
} from "./folder-access.utils";
import {
  EMPTY_FOLDER_ACCESS_FILTER,
  FolderAccessFilter,
  matchesFolderAccessFilter,
  TFolderAccessFilter
} from "./FolderAccessFilter";
import { FolderAccessGrantRow, FolderAccessRow } from "./FolderAccessRow";
import { RemoveFolderAccessDialog } from "./RemoveFolderAccessDialog";

// users and identities come from two separately paginated endpoints that share this page
const PER_PAGE = 20;
// organization members outside the project are not paged, so each kind is capped and search narrows it
const ORG_PREVIEW_LIMIT = 10;
const NO_ACCESS_SECTION = "no-access";

const SectionLabel = ({ title, count }: { title: string; count: number }) => (
  <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
    {title}
    <span className="font-normal text-muted tabular-nums">{count}</span>
  </div>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environmentSlug: string;
  folderPath: string;
  environmentName: string;
};

export const FolderAccessSheet = ({
  isOpen,
  onOpenChange,
  projectId,
  environmentSlug,
  folderPath,
  environmentName
}: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [removalActor, setRemovalActor] = useState<TFolderAccessActor | null>(null);
  const [filter, setFilter] = useState<TFolderAccessFilter>(EMPTY_FOLDER_ACCESS_FILTER);
  const [noAccessSection, setNoAccessSection] = useState("");
  const isFiltering = Boolean(filter.types.length || filter.kinds.length);

  const queryClient = useQueryClient();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission: projectPermission } = useProjectPermission();
  // members without access have no access kind, so an access filter hides the whole section
  const showsNoAccess = !filter.kinds.length;
  const wantsType = (type: TFolderAccessActor["type"]) =>
    !filter.types.length || filter.types.includes(type);
  const canAddUsers =
    projectPermission.can(ProjectPermissionMemberActions.Create, ProjectPermissionSub.Member) &&
    wantsType("user");
  const canAddIdentities =
    projectPermission.can(ProjectPermissionIdentityActions.Create, ProjectPermissionSub.Identity) &&
    wantsType("identity");
  const showsOrgMembers = showsNoAccess && (canAddUsers || canAddIdentities);

  const listArgs = {
    projectId,
    environmentSlug,
    secretPath: folderPath,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
    search: debouncedSearch.trim() || undefined
  };
  const {
    data: users,
    isPending: isUsersPending,
    isFetching: isUsersFetching
  } = useListFolderAccessUsers(listArgs);
  const {
    data: identities,
    isPending: isIdentitiesPending,
    isFetching: isIdentitiesFetching
  } = useListFolderAccessIdentities(listArgs);

  const {
    data: orgUsers,
    isPending: isOrgUsersPending,
    isError: isOrgUsersError
  } = useGetOrgUsers(currentOrg.id, {
    enabled: isOpen && showsNoAccess && canAddUsers
  });
  const {
    data: projectUsers,
    isPending: isProjectUsersPending,
    isError: isProjectUsersError
  } = useGetWorkspaceUsers(projectId, true, undefined, {
    enabled: isOpen && showsNoAccess && canAddUsers
  });
  const {
    data: orgIdentities,
    isPending: isOrgIdentitiesPending,
    isError: isOrgIdentitiesError
  } = useQuery({
    ...projectIdentityMembershipQuery.listAvailable({
      projectId,
      projectType: currentProject.type
    }),
    enabled: isOpen && showsNoAccess && canAddIdentities
  });

  const addUserToProject = useAddUserToWsNonE2EE();
  const addIdentityToProject = useCreateProjectIdentityMembership();
  const createUserAccess = useCreateUserFolderAccess();
  const updateUserAccess = useUpdateUserFolderAccess();
  const deleteUserAccess = useDeleteUserFolderAccess();
  const createIdentityAccess = useCreateIdentityFolderAccess();
  const updateIdentityAccess = useUpdateIdentityFolderAccess();
  const deleteIdentityAccess = useDeleteIdentityFolderAccess();

  const actors = useMemo(
    () =>
      [
        ...(users?.users ?? []).map(toUserActor),
        ...(identities?.identities ?? []).map(toIdentityActor)
      ]
        .filter((actor) => matchesFolderAccessFilter(actor, filter))
        .sort(byAdminThenName),
    [users, identities, filter]
  );

  const isSearching = Boolean(debouncedSearch.trim());

  // the same paged responses carry the project members without access on this folder
  const candidates = useMemo(
    () =>
      showsNoAccess
        ? [
            ...(users?.usersWithoutAccess ?? []).map(toUserActor),
            ...(identities?.identitiesWithoutAccess ?? []).map(toIdentityActor)
          ]
            .filter((actor) => !filter.types.length || filter.types.includes(actor.type))
            .sort(byAdminThenName)
        : [],
    [showsNoAccess, users, identities, filter]
  );

  const orgCandidates = useMemo(() => {
    if (!showsOrgMembers)
      return { actors: [], usernames: new Map<string, string>(), hasMore: false };
    const query = debouncedSearch.trim().toLowerCase();
    const matchesQuery = (values: (string | undefined)[]) =>
      !query || values.some((value) => value?.toLowerCase().includes(query));
    const projectUserIds = new Set((projectUsers ?? []).map(({ user }) => user.id));
    const matchingUsers =
      canAddUsers && orgUsers && projectUsers && !isOrgUsersError && !isProjectUsersError
        ? (orgUsers ?? []).filter(
            (orgUser) =>
              orgUser.isActive &&
              !projectUserIds.has(orgUser.user.id) &&
              matchesQuery([
                orgUser.user.firstName,
                orgUser.user.lastName,
                orgUser.user.email,
                orgUser.inviteEmail
              ])
          )
        : [];
    // this endpoint ignores its name filter and returns every available identity, so it is matched here
    const matchingIdentities = canAddIdentities
      ? (orgIdentities ?? []).filter((identity) => matchesQuery([identity.name]))
      : [];

    return {
      actors: [
        ...matchingUsers.slice(0, ORG_PREVIEW_LIMIT).map(toOrgUserActor),
        ...matchingIdentities.slice(0, ORG_PREVIEW_LIMIT).map(toOrgIdentityActor)
      ].sort(byName),
      usernames: new Map(matchingUsers.map(({ user }) => [user.id, user.username])),
      hasMore:
        matchingUsers.length > ORG_PREVIEW_LIMIT || matchingIdentities.length > ORG_PREVIEW_LIMIT
    };
  }, [
    showsOrgMembers,
    canAddUsers,
    canAddIdentities,
    debouncedSearch,
    orgUsers,
    projectUsers,
    isOrgUsersError,
    isProjectUsersError,
    orgIdentities
  ]);

  const isLoading = isUsersPending || isIdentitiesPending;
  const isOrgLoading =
    showsNoAccess &&
    ((canAddUsers && (isOrgUsersPending || isProjectUsersPending)) ||
      (canAddIdentities && isOrgIdentitiesPending));
  const isOrgError =
    showsNoAccess &&
    ((canAddUsers && (isOrgUsersError || isProjectUsersError)) ||
      (canAddIdentities && isOrgIdentitiesError));
  // a granted candidate stays in this list until the refetch lands, and a second pick would send a
  // duplicate create that the server rejects
  const isGrantLocked =
    addUserToProject.isPending ||
    addIdentityToProject.isPending ||
    createUserAccess.isPending ||
    createIdentityAccess.isPending ||
    isUsersFetching ||
    isIdentitiesFetching;
  // the endpoints page the project roster and only then split each page into the actors that do and
  // do not have access here, so this count pages members and not the rows below it
  const rosterCount = Math.max(users?.totalCount ?? 0, identities?.totalCount ?? 0);
  const pageStart = (page - 1) * PER_PAGE + 1;
  const pageEnd = Math.min(page * PER_PAGE, rosterCount);

  // shown only outside a search, whose results and misses both land in the No Access section
  const emptyState = (() => {
    if (isFiltering && rosterCount > 0) {
      return {
        title: "No matching access",
        description:
          "No one on this page matches these filters. Clear a filter, or check another page."
      };
    }
    if (rosterCount === 0) {
      return {
        title: "No project members",
        description: "This project has no users or machine identities yet."
      };
    }
    return {
      title: "No access on this page",
      description: `None of project members ${pageStart}–${pageEnd} have access to this folder. Grant access from the No Access section, or check another page.`
    };
  })();

  // failures are already surfaced by the global MutationCache.onError toast, which carries the
  // server's own message, so only the success side is announced here
  const notifySuccess = (text: string) => createNotification({ text, type: "success" });

  const setTier = (actor: TFolderAccessActor, permission: SecretFolderRole) => {
    const target = { projectId, environmentSlug, secretPath: folderPath };
    const tierLabel = FOLDER_ROLE_TIER_LABELS[permission];
    const onSuccess = () =>
      notifySuccess(
        actor.access
          ? `Updated ${actor.name} to ${tierLabel} on this folder`
          : `Granted ${actor.name} ${tierLabel} access to this folder`
      );

    if (actor.type === "user") {
      const dto = { ...target, userId: actor.id, permission };
      if (actor.access) updateUserAccess.mutate(dto, { onSuccess });
      else createUserAccess.mutate(dto, { onSuccess });
      return;
    }
    const dto = { ...target, identityId: actor.id, permission };
    if (actor.access) updateIdentityAccess.mutate(dto, { onSuccess });
    else createIdentityAccess.mutate(dto, { onSuccess });
  };

  const setAccessType = (actor: TFolderAccessActor, type: TFolderGrantType) => {
    const target = { projectId, environmentSlug, secretPath: folderPath };
    const onSuccess = () =>
      notifySuccess(
        type.isTemporary
          ? `${actor.name}'s folder access now expires in ${type.temporaryRange}`
          : `Removed the expiration on ${actor.name}'s folder access`
      );

    if (actor.type === "user")
      updateUserAccess.mutate({ ...target, userId: actor.id, type }, { onSuccess });
    else updateIdentityAccess.mutate({ ...target, identityId: actor.id, type }, { onSuccess });
  };

  // folder access only applies to project members, so an organization member joins the project with
  // the No Access role first and reaches nothing beyond the folders granted to them
  const addToProjectAndGrant = async (actor: TFolderAccessActor, tier: SecretFolderRole) => {
    try {
      if (actor.type === "user") {
        await addUserToProject.mutateAsync({
          orgId: currentOrg.id,
          projectId,
          projectType: currentProject.type,
          usernames: [orgCandidates.usernames.get(actor.id) ?? ""],
          roleSlugs: [ProjectMembershipRole.NoAccess]
        });
      } else {
        await addIdentityToProject.mutateAsync({
          identityId: actor.id,
          projectId,
          projectType: currentProject.type,
          role: ProjectMembershipRole.NoAccess
        });
        queryClient.invalidateQueries({ queryKey: projectIdentityMembershipQuery.allKey() });
      }
    } catch {
      // the global MutationCache.onError toast already reports the failure
      return;
    }
    setTier(actor, tier);
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        (queryKey[0] as { projectId?: string })?.projectId === projectId &&
        (queryKey[1] === "folder-access-users" ||
          queryKey[1] === "folder-access-identities" ||
          queryKey[1] === "project-users")
    });
  };

  const removeAccess = (actor: TFolderAccessActor) => {
    const target = { projectId, environmentSlug, secretPath: folderPath };
    const onSuccess = () => {
      notifySuccess(`Removed ${actor.name}'s folder access`);
      setRemovalActor(null);
    };

    if (actor.type === "user")
      deleteUserAccess.mutate({ ...target, userId: actor.id }, { onSuccess });
    else deleteIdentityAccess.mutate({ ...target, identityId: actor.id }, { onSuccess });
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent className="gap-y-0 sm:max-w-[640px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Manage Permissions
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/folder-rbac" />
            </SheetTitle>
            <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-neutral/5 px-3 py-2 text-xs">
              <LayersIcon className="size-3.5 shrink-0 text-muted" />
              <span className="shrink-0 text-foreground">{environmentName}</span>
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted" />
              <FolderIcon className="size-3.5 shrink-0 text-folder" />
              <span className="truncate font-mono text-foreground">{folderPath}</span>
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
                  placeholder="Search users and machine identities..."
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
              <FolderAccessFilter value={filter} onChange={setFilter} />
            </div>

            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            )}

            {!isLoading && !actors.length && !isSearching && (
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

            {!isLoading &&
              isSearching &&
              !actors.length &&
              !candidates.length &&
              !orgCandidates.actors.length &&
              !isOrgLoading &&
              !isOrgError && (
                <p className="text-sm text-muted">No members match your search and filters.</p>
              )}
            {isOrgError && (
              <p className="text-sm text-danger">
                Could not load organization members. Check your member read permissions and try
                again.
              </p>
            )}

            {!isLoading && Boolean(actors.length) && (
              <section className="flex flex-col">
                {actors.map((actor) => (
                  <FolderAccessRow
                    key={`${actor.type}-${actor.id}`}
                    actor={actor}
                    onSetTier={(tier) => setTier(actor, tier)}
                    onSetTemporaryRange={(range) =>
                      setAccessType(actor, {
                        isTemporary: true,
                        temporaryMode: "relative",
                        temporaryRange: range,
                        temporaryAccessStartTime: new Date().toISOString()
                      })
                    }
                    onMakePermanent={() => setAccessType(actor, { isTemporary: false })}
                    onRemove={() => setRemovalActor(actor)}
                  />
                ))}
              </section>
            )}

            {!isLoading && showsNoAccess && (
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
                  <AccordionContent className="space-y-4">
                    {Boolean(candidates.length) && (
                      <section className="flex flex-col">
                        <SectionLabel title="In Project" count={candidates.length} />
                        {candidates.map((actor) => (
                          <FolderAccessGrantRow
                            key={`${actor.type}-${actor.id}`}
                            actor={actor}
                            isDisabled={isGrantLocked}
                            onSetTier={(tier) => setTier(actor, tier)}
                          />
                        ))}
                      </section>
                    )}
                    {showsOrgMembers && Boolean(orgCandidates.actors.length) && (
                      <section className="flex flex-col">
                        <SectionLabel
                          title="In Organization, Not in Project"
                          count={orgCandidates.actors.length}
                        />
                        {orgCandidates.actors.map((actor) => (
                          <FolderAccessGrantRow
                            key={`${actor.type}-${actor.id}`}
                            actor={actor}
                            isDisabled={isGrantLocked}
                            footerNote={`Also adds ${actor.name.split(" ")[0]} to this project with the No Access role.`}
                            onSetTier={(tier) => addToProjectAndGrant(actor, tier)}
                          />
                        ))}
                        {orgCandidates.hasMore && (
                          <p className="py-2.5 text-xs text-muted">
                            Showing the first {ORG_PREVIEW_LIMIT} of each. Search to find someone
                            else.
                          </p>
                        )}
                      </section>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {!isLoading && rosterCount > PER_PAGE && (
              <Pagination
                count={rosterCount}
                page={page}
                perPage={PER_PAGE}
                onChangePage={setPage}
                onChangePerPage={() => {}}
                perPageList={[PER_PAGE]}
                startAdornment={<span className="text-xs text-muted">Project members</span>}
              />
            )}
          </div>

          <SheetFooter className="border-t">
            <span className="text-xs text-muted">Changes save automatically</span>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <RemoveFolderAccessDialog
        actor={removalActor}
        onOpenChange={(open) => {
          if (!open) setRemovalActor(null);
        }}
        onConfirm={removeAccess}
        isPending={deleteUserAccess.isPending || deleteIdentityAccess.isPending}
        folderPath={folderPath}
        environmentName={environmentName}
      />
    </>
  );
};
