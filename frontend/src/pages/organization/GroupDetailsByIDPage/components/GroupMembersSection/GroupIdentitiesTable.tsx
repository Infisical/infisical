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
import { useListGroupIdentities } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { EFilterReturnedIdentities } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupIdentityRow } from "./GroupIdentityRow";

type Props = {
  groupId: string;
  groupSlug: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup", "addGroupMembers"]>,
    data?: object
  ) => void;
};

enum GroupIdentitiesOrderBy {
  Name = "name"
}

export const GroupIdentitiesTable = ({ groupId, groupSlug, handlePopUpOpen }: Props) => {
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
  } = usePagination(GroupIdentitiesOrderBy.Name);

  const { data: groupIdentities, isPending } = useListGroupIdentities({
    id: groupId,
    groupSlug,
    offset,
    limit: perPage,
    search,
    filter: EFilterReturnedIdentities.EXISTING_MEMBERS
  });

  console.log(groupIdentities);

  const filteredGroupMemberships = useMemo(() => {
    return groupIdentities && groupIdentities?.identities
      ? groupIdentities?.identities
          ?.filter((membership) => {
            const identitySearchString = membership.name ?? "";
            return identitySearchString.toLowerCase().includes(search.trim().toLowerCase());
          })
          .sort((a, b) => {
            const [membershipOne, membershipTwo] =
              orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

            const membershipOneComparisonString = membershipOne.name ?? "";
            const membershipTwoComparisonString = membershipTwo.name ?? "";

            const comparison = membershipOneComparisonString
              .toLowerCase()
              .localeCompare(membershipTwoComparisonString.toLowerCase());

            return comparison;
          })
      : [];
  }, [groupIdentities, orderDirection, search]);

  useResetPageHelper({
    totalCount: filteredGroupMemberships?.length,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search identities..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">
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
              <Th>Added On</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="group-identity-memberships" />}
            {!isPending &&
              filteredGroupMemberships
                .slice(offset, perPage * page)
                .map((identityMembership) => (
                  <GroupIdentityRow
                    key={`group-identity-${identityMembership.id}`}
                    identity={identityMembership}
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
        {!isPending && !filteredGroupMemberships?.length && (
          <EmptyState
            title={
              groupIdentities?.identities.length
                ? "No identities match this search..."
                : "This group does not have any identities yet"
            }
            icon={groupIdentities?.identities.length ? faSearch : faFolder}
          />
        )}
      </TableContainer>
    </div>
  );
};
