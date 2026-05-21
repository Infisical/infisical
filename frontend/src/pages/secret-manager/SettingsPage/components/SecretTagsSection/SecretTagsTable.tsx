import { useMemo } from "react";
import { ArrowDownIcon, ArrowUpIcon, SearchIcon, TrashIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useGetWsTags } from "@app/hooks/api/tags";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteTagConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
};

enum TagsOrderBy {
  Slug = "slug"
}

export const SecretTagsTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTags.slice(offset, perPage * page).map(({ id, slug }) => (
                <TableRow key={id}>
                  <TableCell>{slug}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Delete}
                        a={ProjectPermissionSub.Tags}
                      >
                        {(isAllowed) => (
                          <IconButton
                            aria-label="Delete tag"
                            variant="danger"
                            size="xs"
                            onClick={() =>
                              handlePopUpOpen("deleteTagConfirmation", {
                                name: slug,
                                id
                              })
                            }
                            isDisabled={!isAllowed}
                          >
                            <TrashIcon className="size-4" />
                          </IconButton>
                        )}
                      </ProjectPermissionCan>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
