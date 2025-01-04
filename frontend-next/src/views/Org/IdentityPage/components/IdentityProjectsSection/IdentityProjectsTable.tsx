import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faFolder,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetIdentityProjectMemberships } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityProjectRow } from "./IdentityProjectRow";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIdentityFromProject"]>,
    data?: {}
  ) => void;
};

enum IdentityProjectsOrderBy {
  Name = "name"
}

export const IdentityProjectsTable = ({ identityId, handlePopUpOpen }: Props) => {
  const { data: projectMemberships = [], isLoading } = useGetIdentityProjectMemberships(identityId);

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
  } = usePagination(IdentityProjectsOrderBy.Name, { initPerPage: 10 });

  const filteredProjectMemberships = useMemo(
    () =>
      projectMemberships
        ?.filter((membership) =>
          membership.project.name.toLowerCase().includes(search.trim().toLowerCase())
        )
        .sort((a, b) => {
          const [membershipOne, membershipTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          return membershipOne.project.name
            .toLowerCase()
            .localeCompare(membershipTwo.project.name.toLowerCase());
        }),
    [projectMemberships, orderDirection, search]
  );

  useResetPageHelper({
    totalCount: filteredProjectMemberships.length,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search projects..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-2/3">
                <div className="flex items-center">
                  Name
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

              <Th>Type</Th>
              <Th>Role</Th>
              <Th>Added On</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={4} innerKey="identity-project-memberships" />}
            {!isLoading &&
              filteredProjectMemberships.slice(offset, perPage * page).map((membership) => {
                return (
                  <IdentityProjectRow
                    key={`identity-project-membership-${membership.id}`}
                    membership={membership}
                    handlePopUpOpen={handlePopUpOpen}
                  />
                );
              })}
          </TBody>
        </Table>
        {Boolean(filteredProjectMemberships.length) && (
          <Pagination
            count={filteredProjectMemberships.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!isLoading && !filteredProjectMemberships?.length && (
          <EmptyState
            title={
              projectMemberships.length
                ? "No projects match search..."
                : "This identity has not been assigned to any projects"
            }
            icon={projectMemberships.length ? faSearch : faFolder}
          />
        )}
      </TableContainer>
    </div>
  );
};
