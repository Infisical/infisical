import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faMagnifyingGlass,
  faSearch,
  faTag,
  faTrashCan
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
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
  const { currentWorkspace } = useWorkspace();
  const { data: tags = [], isPending } = useGetWsTags(currentWorkspace?.id ?? "");

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
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search tags..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-full">
                <div className="flex items-center">
                  Slug
                  <IconButton
                    variant="plain"
                    className="ml-2"
                    ariaLabel="sort"
                    onClick={toggleOrderDirection}
                  >
                    <FontAwesomeIcon
                      icon={orderDirection === OrderByDirection.DESC ? faArrowUp : faArrowDown}
                    />
                  </IconButton>
                </div>
              </Th>
              <Th aria-label="button" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="secret-tags" />}
            {!isPending &&
              filteredTags.slice(offset, perPage * page).map(({ id, slug }) => (
                <Tr key={id}>
                  <Td>{slug}</Td>
                  <Td className="flex items-center justify-end">
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={ProjectPermissionSub.Tags}
                    >
                      {(isAllowed) => (
                        <IconButton
                          onClick={() =>
                            handlePopUpOpen("deleteTagConfirmation", {
                              name: slug,
                              id
                            })
                          }
                          size="xs"
                          colorSchema="danger"
                          ariaLabel="update"
                          variant="plain"
                          isDisabled={!isAllowed}
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </Td>
                </Tr>
              ))}
          </TBody>
        </Table>
        {Boolean(filteredTags.length) && (
          <Pagination
            count={filteredTags.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !filteredTags?.length && (
          <EmptyState
            title={tags.length ? "No tags match search..." : "No tags found for project"}
            icon={tags.length ? faSearch : faTag}
          />
        )}
      </TableContainer>
    </div>
  );
};
