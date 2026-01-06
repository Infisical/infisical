import { useMemo } from "react";
import { ChevronDownIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Lottie } from "@app/components/v2";
import {
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableInput,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { OrgUser } from "@app/hooks/api/types";
import { useListUserGroupMemberships } from "@app/hooks/api/users/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserGroupsRow } from "./UserGroupsRow";

type Props = {
  orgMembership: OrgUser;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromGroup"]>, data?: object) => void;
};

enum UserGroupsOrderBy {
  Name = "name"
}

export const UserGroupsTable = ({ handlePopUpOpen, orgMembership }: Props) => {
  const { data: groupMemberships = [], isPending } = useListUserGroupMemberships(
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
  } = usePagination(UserGroupsOrderBy.Name, {
    initPerPage: getUserTablePreference("userGroupsTable", PreferenceKey.PerPage, 10)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("userGroupsTable", PreferenceKey.PerPage, newPerPage);
  };

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

  if (isPending) {
    return (
      <div className="flex h-40 w-full items-center justify-center">
        <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
      </div>
    );
  }

  return (
    <>
      <UnstableInput
        className="mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search groups..."
      />
      {filteredGroupMemberships.length ? (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead onClick={toggleOrderDirection} className="w-full">
                Name
                <ChevronDownIcon
                  className={twMerge(
                    orderDirection === OrderByDirection.DESC && "rotate-180",
                    "transition-transform"
                  )}
                />
              </UnstableTableHead>
              <UnstableTableHead className="w-5" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {filteredGroupMemberships.slice(offset, perPage * page).map((group) => (
              <UserGroupsRow
                key={`user-group-${group.id}`}
                group={group}
                handlePopUpOpen={handlePopUpOpen}
              />
            ))}
          </UnstableTableBody>
        </UnstableTable>
      ) : (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {groupMemberships.length
                ? "No groups match this search"
                : "This user has not been assigned to any groups"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {groupMemberships.length
                ? "Adjust search filters to view group memberships."
                : "Assign this user to a group from the group access control page."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      )}
      {Boolean(filteredGroupMemberships.length) && (
        <UnstablePagination
          count={filteredGroupMemberships.length}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
    </>
  );
};
