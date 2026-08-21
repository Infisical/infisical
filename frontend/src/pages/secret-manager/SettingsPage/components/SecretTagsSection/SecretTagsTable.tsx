import { useMemo } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";

import {
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useGetWsTags } from "@app/hooks/api/tags";
import { WsTag } from "@app/hooks/api/tags/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteTagConfirmation", "editSecretTag"]>,
    data: { name: string; id: string } | WsTag
  ) => void;
};

enum TagsOrderBy {
  Slug = "slug"
}

export const SecretTagsTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { data: tags = [], isPending } = useGetWsTags(currentProject?.id ?? "");

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    toggleOrderDirection
  } = usePagination(TagsOrderBy.Slug, {
    initPerPage: getUserTablePreference("secretTagsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("secretTagsTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredTags = useMemo(
    () =>
      tags
        .filter((tag) => tag.slug.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => {
          const [tagOne, tagTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          return tagOne.slug.toLowerCase().localeCompare(tagTwo.slug.toLowerCase());
        }),
    [tags, orderDirection, search]
  );

  useResetPageHelper({
    totalCount: filteredTags.length,
    offset,
    setPage
  });

  return (
    <div>
      <InputGroup className="mb-4">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
        />
      </InputGroup>
      {isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={`secret-tags-skeleton-${idx}`} className="h-10 w-full" />
          ))}
        </div>
      )}
      {!isPending && !filteredTags.length && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{tags.length ? "No tags match search" : "No tags found"}</EmptyTitle>
            <EmptyDescription>
              {tags.length
                ? "Try a different search term."
                : "Create a tag to organize secrets in this project."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!isPending && filteredTags.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">
                  <div className="flex items-center gap-2">
                    Slug
                    <IconButton
                      aria-label="Sort by slug"
                      variant="ghost-muted"
                      size="xs"
                      onClick={toggleOrderDirection}
                    >
                      {orderDirection === OrderByDirection.DESC ? (
                        <ArrowUpIcon className="size-4" />
                      ) : (
                        <ArrowDownIcon className="size-4" />
                      )}
                    </IconButton>
                  </div>
                </TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTags.slice(offset, perPage * page).map((tag) => {
                const { id, slug } = tag;

                return (
                  <TableRow key={id}>
                    <TableCell>{slug}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        {permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Tags) ||
                        permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton aria-label="Tag options" variant="ghost" size="xs">
                                <MoreHorizontalIcon className="size-4" />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              {permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Tags) && (
                                <DropdownMenuItem onClick={() => handlePopUpOpen("editSecretTag", tag)}>
                                  <PencilIcon />
                                  Edit tag
                                </DropdownMenuItem>
                              )}
                              {permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.Tags) && (
                                <DropdownMenuItem
                                  variant="danger"
                                  onClick={() =>
                                    handlePopUpOpen("deleteTagConfirmation", {
                                      name: slug,
                                      id
                                    })
                                  }
                                >
                                  <TrashIcon />
                                  Delete tag
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            count={filteredTags.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        </>
      )}
    </div>
  );
};
