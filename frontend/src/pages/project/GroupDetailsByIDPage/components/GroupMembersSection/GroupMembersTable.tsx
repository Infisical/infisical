import { useEffect, useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faFolder,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import {
  ConfirmActionModal,
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
import { useOrganization, useProject } from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useAssumeProjectPrivileges } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useListProjectGroupUsers } from "@app/hooks/api/groups/queries";
import { EFilterReturnedUsers, TGroupMembership } from "@app/hooks/api/groups/types";

import { GroupMembershipRow } from "./GroupMembershipRow";

type Props = {
  groupMembership: TGroupMembership;
};

enum GroupMembersOrderBy {
  Name = "name"
}

export const GroupMembersTable = ({ groupMembership }: Props) => {
  const navigate = useNavigate();
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
    initPerPage: getUserTablePreference("projectGroupMembersTable", PreferenceKey.PerPage, 20)
  });

  // this handles links from secret versions when the actor is in a group membership
  const { username, ...restSearch } = useSearch({
    strict: false
  });
  useEffect(() => {
    if (username) {
      setSearch(username);
      navigate({
        to: ".",
        replace: true,
        search: restSearch
      });
    }
  }, [username]);

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["assumePrivileges"] as const);

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("projectGroupMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { data: groupMemberships, isPending } = useListProjectGroupUsers({
    id: groupMembership.group.id,
    groupSlug: groupMembership.group.slug,
    projectId: currentProject.id,
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

  const assumePrivileges = useAssumeProjectPrivileges();

  const handleAssumePrivileges = async () => {
    const { userId } = popUp?.assumePrivileges?.data as { userId: string };
    assumePrivileges.mutate(
      {
        actorId: userId,
        actorType: ActorType.USER,
        projectId: currentProject.id
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: "User privilege assumption has started"
          });

          const url = getProjectHomePage(currentProject.type, currentProject.environments);
          window.location.assign(
            url.replace("$orgId", currentOrg.id).replace("$projectId", currentProject.id)
          );
        }
      }
    );
  };

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
                    onAssumePrivileges={(userId) => handlePopUpOpen("assumePrivileges", { userId })}
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
      </TableContainer>
      <ConfirmActionModal
        isOpen={popUp.assumePrivileges.isOpen}
        confirmKey="assume"
        title="Do you want to assume privileges of this user?"
        subTitle="This will set your privileges to those of the user for the next hour."
        onChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
        onConfirmed={handleAssumePrivileges}
        buttonText="Confirm"
      />
    </div>
  );
};
