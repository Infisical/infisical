import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faFolder,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
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
  Tooltip,
  Tr
} from "@app/components/v2";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useListGroupUsers, useOidcManageGroupMembershipsEnabled } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { EFilterReturnedUsers } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupMembershipRow } from "./GroupMembershipRow";

type Props = {
  groupId: string;
  groupSlug: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup", "addGroupMembers"]>,
    data?: object
  ) => void;
};

enum GroupMembersOrderBy {
  Name = "name"
}

export const GroupMembersTable = ({ groupId, groupSlug, handlePopUpOpen }: Props) => {
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
  } = usePagination(GroupMembersOrderBy.Name, {
    initPerPage: getUserTablePreference("groupMembersTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("groupMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { currentOrg } = useOrganization();

  const { data: isOidcManageGroupMembershipsEnabled = false } =
    useOidcManageGroupMembershipsEnabled(currentOrg.id);

  const { data: groupMemberships, isPending } = useListGroupUsers({
    id: groupId,
    groupSlug,
    offset,
    limit: perPage,
    search,
    filter: EFilterReturnedUsers.EXISTING_MEMBERS
  });

  const filteredGroupMemberships = useMemo(() => {
    return groupMemberships && groupMemberships?.users
      ? groupMemberships?.users
          ?.filter((membership) => {
            const userSearchString = `${membership.firstName && membership.firstName} ${
              membership.lastName && membership.lastName
            } ${membership.email && membership.email} ${
              membership.username && membership.username
            }`;
            return userSearchString.toLowerCase().includes(search.trim().toLowerCase());
          })
          .sort((a, b) => {
            const [membershipOne, membershipTwo] =
              orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

            const membershipOneComparisonString = membershipOne.firstName
              ? membershipOne.firstName
              : membershipOne.email;

            const membershipTwoComparisonString = membershipTwo.firstName
              ? membershipTwo.firstName
              : membershipTwo.email;

            const comparison = membershipOneComparisonString
              .toLowerCase()
              .localeCompare(membershipTwoComparisonString.toLowerCase());

            return comparison;
          })
      : [];
  }, [groupMemberships, orderDirection, search]);

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
        placeholder="Search users..."
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
              <Th>Email</Th>
              <Th>Added On</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="group-user-memberships" />}
            {!isPending &&
              filteredGroupMemberships.slice(offset, perPage * page).map((userGroupMembership) => {
                return (
                  <GroupMembershipRow
                    key={`user-group-membership-${userGroupMembership.id}`}
                    user={userGroupMembership}
                    handlePopUpOpen={handlePopUpOpen}
                  />
                );
              })}
          </TBody>
        </Table>
        {Boolean(filteredGroupMemberships.length) && (
          <Pagination
            count={filteredGroupMemberships.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !filteredGroupMemberships?.length && (
          <EmptyState
            title={
              groupMemberships?.users.length
                ? "No users match this search..."
                : "This group does not have any members yet"
            }
            icon={groupMemberships?.users.length ? faSearch : faFolder}
          />
        )}
        {!groupMemberships?.users.length && (
          <OrgPermissionCan I={OrgPermissionGroupActions.Edit} a={OrgPermissionSubjects.Groups}>
            {(isAllowed) => (
              <Tooltip
                className="text-center"
                content={
                  isOidcManageGroupMembershipsEnabled
                    ? "OIDC Group Membership Mapping Enabled. Assign users to this group in your OIDC provider."
                    : undefined
                }
              >
                <div className="mb-4 flex items-center justify-center">
                  <Button
                    variant="solid"
                    colorSchema="secondary"
                    isDisabled={isOidcManageGroupMembershipsEnabled || !isAllowed}
                    onClick={() => {
                      handlePopUpOpen("addGroupMembers", {
                        groupId,
                        slug: groupSlug
                      });
                    }}
                  >
                    Add members
                  </Button>
                </div>
              </Tooltip>
            )}
          </OrgPermissionCan>
        )}
      </TableContainer>
    </div>
  );
};
