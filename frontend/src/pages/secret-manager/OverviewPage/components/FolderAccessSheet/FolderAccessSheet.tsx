import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BotIcon, SearchIcon, UserIcon, UsersIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
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
  isRootFolderPath,
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
import { FolderPathBreadcrumb } from "./FolderPathBreadcrumb";
import { RemoveFolderAccessDialog } from "./RemoveFolderAccessDialog";

// users and identities come from two separately paginated endpoints that share this page
const PER_PAGE = 20;
// organization members outside the project are not paged, so each kind is capped and search narrows it
const ORG_PREVIEW_LIMIT = 10;
const NO_ACCESS_SECTION = "no-access";

const ACTOR_TYPES: TFolderAccessActor["type"][] = ["user", "identity"];

const SectionLabel = ({
  title,
  count,
  description
}: {
  title: string;
  count: number;
  description?: string;
}) => (
  <div className="pb-1">
    <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
      {title}
      <span className="font-normal text-muted tabular-nums">{count}</span>
    </div>
    {description && <p className="text-xs text-muted">{description}</p>}
  </div>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environmentSlug: string;
  folderPath: string;
  environmentName: string;
  onManageRootAccess?: () => void;
};

export const FolderAccessSheet = ({
  isOpen,
  onOpenChange,
  projectId,
  environmentSlug,
  folderPath,
  environmentName,
  onManageRootAccess
}: Props) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [removalActor, setRemovalActor] = useState<TFolderAccessActor | null>(null);
  const [filter, setFilter] = useState<TFolderAccessFilter>(EMPTY_FOLDER_ACCESS_FILTER);
  const [noAccessSection, setNoAccessSection] = useState("");
  const [noAccessTab, setNoAccessTab] = useState<TFolderAccessActor["type"]>("user");
  const isFiltering = Boolean(filter.types.length || filter.kinds.length);
  const isRoot = isRootFolderPath(folderPath);

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
      return {
        actors: { user: [], identity: [] },
        totals: { user: 0, identity: 0 },
        usernames: new Map<string, string>()
      };
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
      actors: {
        user: matchingUsers.slice(0, ORG_PREVIEW_LIMIT).map(toOrgUserActor).sort(byName),
        identity: matchingIdentities
          .slice(0, ORG_PREVIEW_LIMIT)
          .map(toOrgIdentityActor)
          .sort(byName)
      },
      totals: { user: matchingUsers.length, identity: matchingIdentities.length },
      usernames: new Map(matchingUsers.map(({ user }) => [user.id, user.username]))
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

  const noAccessCounts = {
    user: candidates.filter((actor) => actor.type === "user").length + orgCandidates.totals.user,
    identity:
      candidates.filter((actor) => actor.type === "identity").length + orgCandidates.totals.identity
  };

  const isLoading = isUsersPending || isIdentitiesPending;
  const isOrgLoading =
    showsNoAccess &&
    ((canAddUsers && (isOrgUsersPending || isProjectUsersPending)) ||
      (canAddIdentities && isOrgIdentitiesPending));
  const isOrgTypeLoading = {
    user: canAddUsers && (isOrgUsersPending || isProjectUsersPending),
    identity: canAddIdentities && isOrgIdentitiesPending
  };
  // a type filter can exclude the tab the user last picked, so fall back to the one still shown
  const activeNoAccessTab = wantsType(noAccessTab)
    ? noAccessTab
    : (ACTOR_TYPES.find(wantsType) ?? noAccessTab);
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
  const isAccessLocked =
    isGrantLocked || updateUserAccess.isPending || updateIdentityAccess.isPending;
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

  const setTier = (
    actor: TFolderAccessActor,
    permission: SecretFolderRole,
    isPermissionRecursive = false
  ) => {
    const target = { projectId, environmentSlug, secretPath: folderPath };
    const tierLabel = FOLDER_ROLE_TIER_LABELS[permission];
    const appliesToSubfolders = actor.access
      ? actor.access.isPermissionRecursive
      : isPermissionRecursive;
    const scope = appliesToSubfolders ? "this folder and its subfolders" : "this folder";
    const onSuccess = () =>
      notifySuccess(
        actor.access
          ? `Updated ${actor.name} to ${tierLabel} on ${scope}`
          : `Granted ${actor.name} ${tierLabel} access to ${scope}`
      );
    const recursion = isPermissionRecursive ? { isPermissionRecursive } : {};

    if (actor.type === "user") {
      if (actor.access)
        updateUserAccess.mutate({ ...target, userId: actor.id, permission }, { onSuccess });
      else
        createUserAccess.mutate(
          { ...target, userId: actor.id, permission, ...recursion },
          { onSuccess }
        );
      return;
    }
    if (actor.access)
      updateIdentityAccess.mutate({ ...target, identityId: actor.id, permission }, { onSuccess });
    else
      createIdentityAccess.mutate(
        { ...target, identityId: actor.id, permission, ...recursion },
        { onSuccess }
      );
  };

  const setRecursive = (actor: TFolderAccessActor, isPermissionRecursive: boolean) => {
    const target = { projectId, environmentSlug, secretPath: folderPath };
    const onSuccess = () =>
      notifySuccess(
        isPermissionRecursive
          ? `${actor.name}'s access now applies to ${folderPath} and all of its subfolders`
          : `${actor.name}'s access now applies to ${folderPath} only`
      );

    if (actor.type === "user")
      updateUserAccess.mutate(
        { ...target, userId: actor.id, isPermissionRecursive },
        { onSuccess }
      );
    else
      updateIdentityAccess.mutate(
        { ...target, identityId: actor.id, isPermissionRecursive },
        { onSuccess }
      );
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
  const addToProjectAndGrant = async (
    actor: TFolderAccessActor,
    tier: SecretFolderRole,
    isRecursive: boolean
  ) => {
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
    setTier(actor, tier, isRecursive);
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
            <FolderPathBreadcrumb environmentName={environmentName} folderPath={folderPath} />
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
              !orgCandidates.totals.user &&
              !orgCandidates.totals.identity &&
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
                <SectionLabel title="Access" count={actors.length} />
                <div className="divide-y divide-border">
                  {actors.map((actor) => (
                    <FolderAccessRow
                      key={`${actor.type}-${actor.id}`}
                      actor={actor}
                      isPending={isAccessLocked}
                      canApplyToSubfolders={isRoot}
                      onSetTier={(tier, isRecursive) => setTier(actor, tier, isRecursive)}
                      onSetRecursive={(isRecursive) => setRecursive(actor, isRecursive)}
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
                      onManageInheritedAccess={onManageRootAccess}
                    />
                  ))}
                </div>
              </section>
            )}

            {!isLoading && showsNoAccess && (
              <Accordion
                type="single"
                collapsible
                value={noAccessSection}
                onValueChange={setNoAccessSection}
              >
                <AccordionItem value={NO_ACCESS_SECTION}>
                  <AccordionTrigger>
                    <span className="flex-1">No Access</span>
                    <span className="flex items-center gap-3 text-xs font-normal text-muted tabular-nums">
                      <span className="flex items-center gap-1" title="Users">
                        <UserIcon className="size-3.5" />
                        {noAccessCounts.user}
                      </span>
                      <span className="flex items-center gap-1" title="Machine identities">
                        <BotIcon className="size-3.5" />
                        {noAccessCounts.identity}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="p-4">
                    <Tabs
                      value={activeNoAccessTab}
                      onValueChange={(value) => setNoAccessTab(value as TFolderAccessActor["type"])}
                    >
                      <TabsList className="w-full">
                        {wantsType("user") && (
                          <TabsTrigger value="user">
                            <UserIcon className="hidden sm:block" />
                            Users
                            <Badge variant="neutral">{noAccessCounts.user}</Badge>
                          </TabsTrigger>
                        )}
                        {wantsType("identity") && (
                          <TabsTrigger value="identity">
                            <BotIcon className="hidden sm:block" />
                            <span className="sm:hidden">Identities</span>
                            <span className="hidden sm:inline">Machine Identities</span>
                            <Badge variant="neutral">{noAccessCounts.identity}</Badge>
                          </TabsTrigger>
                        )}
                      </TabsList>
                      {ACTOR_TYPES.map((type) => {
                        const projectCandidates = candidates.filter((actor) => actor.type === type);
                        const orgTypeCandidates = orgCandidates.actors[type];
                        const kindLabel = type === "user" ? "users" : "machine identities";
                        return (
                          <TabsContent key={type} value={type} className="space-y-4">
                            {!projectCandidates.length &&
                              !orgTypeCandidates.length &&
                              isOrgTypeLoading[type] && <Skeleton className="h-12 w-full" />}
                            {!projectCandidates.length &&
                              !orgTypeCandidates.length &&
                              !isOrgTypeLoading[type] && (
                                <p className="py-2 text-xs text-muted">
                                  No {kindLabel} without access
                                  {isSearching ? " match your search" : ""}.
                                </p>
                              )}
                            {Boolean(projectCandidates.length) && (
                              <section className="flex flex-col">
                                <SectionLabel
                                  title="In Project"
                                  count={projectCandidates.length}
                                  description="Their project role gives no access to this folder."
                                />
                                <div className="divide-y divide-border">
                                  {projectCandidates.map((actor) => (
                                    <FolderAccessGrantRow
                                      key={`${actor.type}-${actor.id}`}
                                      actor={actor}
                                      isDisabled={isGrantLocked}
                                      isPending={isGrantLocked}
                                      canApplyToSubfolders={isRoot}
                                      onSetTier={(tier, isRecursive) =>
                                        setTier(actor, tier, isRecursive)
                                      }
                                    />
                                  ))}
                                </div>
                              </section>
                            )}
                            {Boolean(orgTypeCandidates.length) && (
                              <section className="flex flex-col">
                                <SectionLabel
                                  title="In Organization, Not in Project"
                                  count={orgCandidates.totals[type]}
                                  description="Granting access also adds them to the project."
                                />
                                <div className="divide-y divide-border">
                                  {orgTypeCandidates.map((actor) => (
                                    <FolderAccessGrantRow
                                      key={`${actor.type}-${actor.id}`}
                                      actor={actor}
                                      isDisabled={isGrantLocked}
                                      isPending={isGrantLocked}
                                      canApplyToSubfolders={isRoot}
                                      footerNote={`Also adds ${actor.name.split(" ")[0]} to this project with the No Access role.`}
                                      onSetTier={(tier, isRecursive) =>
                                        addToProjectAndGrant(actor, tier, isRecursive)
                                      }
                                    />
                                  ))}
                                </div>
                                {orgCandidates.totals[type] > ORG_PREVIEW_LIMIT && (
                                  <p className="py-2.5 text-xs text-muted">
                                    Showing the first {ORG_PREVIEW_LIMIT}. Search to find someone
                                    else.
                                  </p>
                                )}
                              </section>
                            )}
                          </TabsContent>
                        );
                      })}
                    </Tabs>
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
