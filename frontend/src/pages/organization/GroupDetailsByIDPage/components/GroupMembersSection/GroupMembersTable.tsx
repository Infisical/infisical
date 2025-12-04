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
import { useOidcManageGroupMembershipsEnabled } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useListGroupMembers } from "@app/hooks/api/groups/queries";
import { EGroupMembersOrderBy, EGroupMemberType } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupMembershipIdentityRow } from "./GroupMembershipIdentityRow";
import { GroupMembershipUserRow } from "./GroupMembershipUserRow";

type Props = {
  groupId: string;
  groupSlug: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeMemberFromGroup", "addGroupMembers"]>,
    data?: object
  ) => void;
};

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
    toggleOrderDirection,
    orderBy
  } = usePagination(EGroupMembersOrderBy.Name, {
    initPerPage: getUserTablePreference("groupMembersTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("groupMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { currentOrg } = useOrganization();

  const { data: isOidcManageGroupMembershipsEnabled = false } =
    useOidcManageGroupMembershipsEnabled(currentOrg.id);

  const { data: groupMemberships, isPending } = useListGroupMembers({
    id: groupId,
    groupSlug,
    offset,
    limit: perPage,
    search,
    orderBy,
    orderDirection
  });

  const { members = [], totalCount = 0 } = groupMemberships ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search members..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-5" />
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
            {isPending && <TableSkeleton columns={4} innerKey="group-user-memberships" />}
            {!isPending &&
              groupMemberships?.members?.map((userGroupMembership) => {
                return userGroupMembership.memberType === EGroupMemberType.USER ? (
                  <GroupMembershipUserRow
                    key={`user-group-membership-${userGroupMembership.id}`}
                    user={userGroupMembership}
                    handlePopUpOpen={handlePopUpOpen}
                  />
                ) : (
                  <GroupMembershipIdentityRow
                    key={`identity-group-membership-${userGroupMembership.id}`}
                    identity={userGroupMembership}
                    handlePopUpOpen={handlePopUpOpen}
                  />
                );
              })}
          </TBody>
        </Table>
        {Boolean(totalCount) && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && !members.length && (
          <EmptyState
            title={
              groupMemberships?.members.length
                ? "No members match this search..."
                : "This group does not have any members yet"
            }
            icon={groupMemberships?.members.length ? faSearch : faFolder}
          />
        )}
        {!groupMemberships?.members.length && (
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
