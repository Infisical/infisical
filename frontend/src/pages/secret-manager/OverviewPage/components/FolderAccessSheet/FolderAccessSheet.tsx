import { useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  FolderIcon,
  LayersIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DocumentationLinkBadge,
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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useDebounce } from "@app/hooks";
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
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { AddFolderAccessPanel } from "./AddFolderAccessPanel";
import { FOLDER_ROLE_TIER_LABELS } from "./folder-access.const";
import {
  byAdminThenName,
  TFolderAccessActor,
  toIdentityActor,
  toUserActor
} from "./folder-access.utils";
import { FolderAccessGrantRow, FolderAccessRow } from "./FolderAccessRow";
import { RemoveFolderAccessDialog } from "./RemoveFolderAccessDialog";

// users and identities come from two separately paginated endpoints that share this page
const PER_PAGE = 20;

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
  const { currentOrg } = useOrganization();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [isAddingMultiple, setIsAddingMultiple] = useState(false);
  const [removalActor, setRemovalActor] = useState<TFolderAccessActor | null>(null);

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
      ].sort(byAdminThenName),
    [users, identities]
  );

  const isSearching = Boolean(debouncedSearch.trim());

  // the same responses carry the members without access, so searching doubles as the grant flow
  const candidates = useMemo(
    () =>
      isSearching
        ? [
            ...(users?.usersWithoutAccess ?? []).map(toUserActor),
            ...(identities?.identitiesWithoutAccess ?? []).map(toIdentityActor)
          ].sort(byAdminThenName)
        : [],
    [isSearching, users, identities]
  );

  const isLoading = isUsersPending || isIdentitiesPending;
  // a granted candidate stays in this list until the refetch lands, and a second pick would send a
  // duplicate create that the server rejects
  const isGrantLocked =
    createUserAccess.isPending ||
    createIdentityAccess.isPending ||
    isUsersFetching ||
    isIdentitiesFetching;
  // the endpoints page the project roster and only then split each page into the actors that do and
  // do not have access here, so this count pages members and not the rows below it
  const rosterCount = Math.max(users?.totalCount ?? 0, identities?.totalCount ?? 0);
  const pageStart = (page - 1) * PER_PAGE + 1;
  const pageEnd = Math.min(page * PER_PAGE, rosterCount);

  const emptyState = (() => {
    if (rosterCount === 0) {
      return isSearching
        ? {
            title: "No members found",
            description:
              "No one in this project matches your search. Invite them to the project first, then grant folder access here."
          }
        : {
            title: "No project members",
            description: "This project has no users or machine identities to grant access to."
          };
    }
    return {
      title: "No access on this page",
      description: isSearching
        ? "None of the members matching your search on this page have access to this folder. Check another page, or refine your search."
        : `None of project members ${pageStart}–${pageEnd} have access to this folder. Check another page, or search for someone by name.`
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
      <Sheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) setIsAddingMultiple(false);
          onOpenChange(open);
        }}
      >
        <SheetContent className="gap-y-0 sm:max-w-[640px]">
          <SheetHeader className="gap-3">
            <SheetTitle className="flex items-center gap-2">
              {isAddingMultiple && (
                <IconButton
                  variant="ghost-muted"
                  size="xs"
                  aria-label="Back to permissions"
                  onClick={() => setIsAddingMultiple(false)}
                >
                  <ArrowLeftIcon />
                </IconButton>
              )}
              {isAddingMultiple ? "Add Access" : "Manage Permissions"}
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

          {isAddingMultiple ? (
            <AddFolderAccessPanel
              projectId={projectId}
              environmentSlug={environmentSlug}
              folderPath={folderPath}
              onDone={() => setIsAddingMultiple(false)}
            />
          ) : (
            <>
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
                  <Button
                    variant="outline"
                    size="md"
                    className="shrink-0"
                    onClick={() => {
                      setIsAddingMultiple(true);
                      analytics.captureForOrganization(
                        AnalyticsEvent.FolderAccessAddSheetOpened,
                        currentOrg.id,
                        { projectId }
                      );
                    }}
                  >
                    <UserPlusIcon />
                    Add Multiple
                  </Button>
                </div>

                {isLoading && (
                  <div className="space-y-2">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                )}

                {!isLoading && !actors.length && !candidates.length && (
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

                {!isLoading && Boolean(actors.length || candidates.length) && (
                  <section className="flex flex-col">
                    <SectionLabel title="Has Access" count={actors.length} />
                    {!actors.length && (
                      <p className="py-2.5 text-xs text-muted">
                        {rosterCount > PER_PAGE
                          ? "No one matching your search on this page has access to this folder. Check another page, or refine your search."
                          : "No one matching your search has access to this folder yet."}
                      </p>
                    )}
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

                {!isLoading && Boolean(candidates.length) && (
                  <section className="flex flex-col">
                    <SectionLabel title="Other Project Members" count={candidates.length} />
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
            </>
          )}
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
