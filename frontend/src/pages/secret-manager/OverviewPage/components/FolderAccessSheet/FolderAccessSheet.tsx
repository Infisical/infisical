import { useMemo, useState } from "react";
import { FolderIcon, InfoIcon, SearchIcon, UsersIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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

import { AddFolderAccessSheet } from "./AddFolderAccessSheet";
import { FOLDER_ROLE_TIER_LABELS } from "./folder-access.const";
import { byName, TFolderAccessActor, toIdentityActor, toUserActor } from "./folder-access.utils";
import { FolderAccessRow } from "./FolderAccessRow";
import { RemoveFolderAccessDialog } from "./RemoveFolderAccessDialog";

// users and identities come from two separately paginated endpoints, so the merged list is built
// from one max-size page of each and paged client side
const FETCH_LIMIT = 100;
const PER_PAGE = 20;

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
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [removalActor, setRemovalActor] = useState<TFolderAccessActor | null>(null);

  const listArgs = {
    projectId,
    environmentSlug,
    secretPath: folderPath,
    limit: FETCH_LIMIT,
    search: debouncedSearch.trim() || undefined
  };
  const { data: users, isPending: isUsersPending } = useListFolderAccessUsers(listArgs);
  const { data: identities, isPending: isIdentitiesPending } =
    useListFolderAccessIdentities(listArgs);

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
      ].sort(byName),
    [users, identities]
  );

  const isLoading = isUsersPending || isIdentitiesPending;
  const visibleActors = actors.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const isTruncated =
    (users?.totalCount ?? 0) > FETCH_LIMIT || (identities?.totalCount ?? 0) > FETCH_LIMIT;

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
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent className="gap-y-0 sm:max-w-[640px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              Manage Permissions
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-3.5 text-muted" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Permissions granted here apply within this folder. The folder itself can still be
                  moved, edited, or deleted by anyone with folder edit or delete permissions.
                </TooltipContent>
              </Tooltip>
            </SheetTitle>
            <div className="mt-2 flex min-w-0 items-center gap-2 text-xs">
              <Badge variant="project" className="shrink-0">
                {environmentName}
              </Badge>

              <FolderIcon className="size-3.5 shrink-0 text-folder" />
              <span className="truncate font-mono text-mineshaft-100/80">{folderPath}</span>
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
                  }}
                  placeholder="Search users & machine identities..."
                />
              </InputGroup>
              <Button
                variant="project"
                size="sm"
                className="shrink-0"
                onClick={() => setIsAddOpen(true)}
              >
                Add Access
              </Button>
            </div>

            {isLoading && (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            )}

            {!isLoading && !actors.length && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon />
                  </EmptyMedia>
                  <EmptyTitle>No matches found</EmptyTitle>
                  <EmptyDescription>
                    {debouncedSearch.trim()
                      ? "No users or machine identities match your search."
                      : "This project has no users or machine identities yet."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

            {!isLoading && Boolean(actors.length) && (
              <div className="flex flex-col">
                {visibleActors.map((actor) => (
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
              </div>
            )}

            {actors.length > PER_PAGE && (
              <Pagination
                count={actors.length}
                page={page}
                perPage={PER_PAGE}
                onChangePage={setPage}
                onChangePerPage={() => {}}
                perPageList={[PER_PAGE]}
              />
            )}

            {isTruncated && (
              <p className="text-xs text-muted">
                Showing the first {FETCH_LIMIT} users and {FETCH_LIMIT} machine identities. Use
                search to narrow the list.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AddFolderAccessSheet
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        projectId={projectId}
        environmentSlug={environmentSlug}
        folderPath={folderPath}
        environmentName={environmentName}
      />

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
