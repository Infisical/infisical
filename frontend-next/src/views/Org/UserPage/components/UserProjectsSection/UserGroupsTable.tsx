import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faMagnifyingGlass,
  faSearch,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { OrgUser } from "@app/hooks/api/types";
import { useListUserGroupMemberships } from "@app/hooks/api/users/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserGroupsRow } from "./UserGroupsRow";

type Props = {
  orgMembership: OrgUser;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromGroup"]>, data?: {}) => void;
};

enum UserGroupsOrderBy {
  Name = "name"
}

export const UserGroupsTable = ({ handlePopUpOpen, orgMembership }: Props) => {
  const { data: groupMemberships = [], isLoading } = useListUserGroupMemberships(
    orgMembership.user.username
  );

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
  } = usePagination(UserGroupsOrderBy.Name, { initPerPage: 10 });

  const filteredGroupMemberships = useMemo(
    () =>
      groupMemberships
        .filter((group) => group.name.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => {
          const [membershipOne, membershipTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          return membershipOne.name.toLowerCase().localeCompare(membershipTwo.name.toLowerCase());
        }),
    [groupMemberships, orderDirection, search]
  );

  useResetPageHelper({
    totalCount: filteredGroupMemberships.length,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search groups..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-full">
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
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {filteredGroupMemberships.slice(offset, perPage * page).map((group) => (
              <UserGroupsRow
                key={`user-group-${group.id}`}
                group={group}
                handlePopUpOpen={handlePopUpOpen}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredGroupMemberships.length) && (
          <Pagination
            count={filteredGroupMemberships.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!isLoading && !filteredGroupMemberships?.length && (
          <EmptyState
            title={
              groupMemberships.length
                ? "No groups match search..."
                : "This user has not been assigned to any groups"
            }
            icon={groupMemberships.length ? faSearch : faUser}
          />
        )}
      </TableContainer>
    </div>
  );
};
