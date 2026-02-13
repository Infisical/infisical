import { useState } from "react";
import { ChevronDownIcon, FilterIcon, HardDriveIcon, PlusIcon, UserIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import { Lottie } from "@app/components/v2";
import {
  Button,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableInput,
  UnstablePagination,
  UnstableTable,
  UnstableTableBody,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { OrgPermissionGroupActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useListGroupMembers } from "@app/hooks/api/groups/queries";
import {
  FilterMemberType,
  GroupMembersOrderBy,
  GroupMemberType
} from "@app/hooks/api/groups/types";
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
  isLinkedGroup?: boolean;
};

export const GroupMembersTable = ({
  groupId,
  groupSlug,
  handlePopUpOpen,
  isLinkedGroup = false
}: Props) => {
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
  } = usePagination(GroupMembersOrderBy.Name, {
    initPerPage: getUserTablePreference("groupMembersTable", PreferenceKey.PerPage, 20)
  });

  const [memberTypeFilter, setMemberTypeFilter] = useState<FilterMemberType[]>([]);

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("groupMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { isSubOrganization } = useOrganization();

  const { data: groupMemberships, isPending } = useListGroupMembers({
    id: groupId,
    groupSlug,
    offset,
    limit: perPage,
    search,
    orderBy,
    orderDirection,
    memberTypeFilter: memberTypeFilter.length > 0 ? memberTypeFilter : undefined
  });

  const { members = [], totalCount = 0 } = groupMemberships ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const filterOptions = [
    {
      icon: <UserIcon size={16} />,
      label: "Users",
      value: FilterMemberType.USERS
    },
    {
      icon: <HardDriveIcon size={16} />,
      label: "Machine Identities",
      value: FilterMemberType.MACHINE_IDENTITIES
    }
  ];

  if (isPending) {
    return (
      <div className="flex h-40 w-full items-center justify-center">
        <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
      </div>
    );
  }

  const isFiltered = search || memberTypeFilter.length;

  return (
    <>
      <div className="mb-4 flex gap-2">
        <UnstableInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members..."
          className="flex-1"
        />
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton
              variant={
                // eslint-disable-next-line no-nested-ternary
                memberTypeFilter.length ? (isSubOrganization ? "sub-org" : "org") : "outline"
              }
            >
              <FilterIcon />
            </UnstableIconButton>
          </UnstableDropdownMenuTrigger>
          <UnstableDropdownMenuContent align="end">
            <UnstableDropdownMenuLabel>Filter by Member Type</UnstableDropdownMenuLabel>
            {filterOptions.map((option) => (
              <UnstableDropdownMenuCheckboxItem
                key={option.value}
                checked={memberTypeFilter.includes(option.value)}
                onClick={(e) => {
                  e.preventDefault();
                  setMemberTypeFilter((prev) => {
                    if (prev.includes(option.value)) {
                      return prev.filter((f) => f !== option.value);
                    }
                    return [...prev, option.value];
                  });
                  setPage(1);
                }}
              >
                {option.label}
              </UnstableDropdownMenuCheckboxItem>
            ))}
          </UnstableDropdownMenuContent>
        </UnstableDropdownMenu>
      </div>
      {members.length ? (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead className="w-5" />
              <UnstableTableHead onClick={toggleOrderDirection} className="w-2/3">
                Name
                <ChevronDownIcon
                  className={twMerge(
                    orderDirection === OrderByDirection.DESC && "rotate-180",
                    "transition-transform"
                  )}
                />
              </UnstableTableHead>
              <UnstableTableHead>Added On</UnstableTableHead>
              <UnstableTableHead className="w-5" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {members.map((userGroupMembership) =>
              userGroupMembership.type === GroupMemberType.USER ? (
                <GroupMembershipUserRow
                  key={`user-group-membership-${userGroupMembership.id}`}
                  user={userGroupMembership}
                  handlePopUpOpen={handlePopUpOpen}
                  isLinkedGroup={isLinkedGroup}
                />
              ) : (
                <GroupMembershipIdentityRow
                  key={`identity-group-membership-${userGroupMembership.id}`}
                  identity={userGroupMembership}
                  handlePopUpOpen={handlePopUpOpen}
                  isLinkedGroup={isLinkedGroup}
                />
              )
            )}
          </UnstableTableBody>
        </UnstableTable>
      ) : (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {isFiltered ? "No members match this search" : "This group does not have any members"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {isFiltered
                ? "Adjust search filters to view members."
                : "Add users or machine identities to this group."}
            </UnstableEmptyDescription>
            {!isFiltered && !isLinkedGroup && (
              <UnstableEmptyContent>
                <OrgPermissionCan
                  I={OrgPermissionGroupActions.Edit}
                  a={OrgPermissionSubjects.Groups}
                >
                  {(isAllowed) => (
                    <Button
                      variant={isSubOrganization ? "sub-org" : "org"}
                      size="xs"
                      isDisabled={!isAllowed}
                      onClick={() =>
                        handlePopUpOpen("addGroupMembers", {
                          groupId,
                          slug: groupSlug
                        })
                      }
                    >
                      <PlusIcon />
                      Add Member
                    </Button>
                  )}
                </OrgPermissionCan>
              </UnstableEmptyContent>
            )}
          </UnstableEmptyHeader>
        </UnstableEmpty>
      )}
      {Boolean(members.length) && (
        <UnstablePagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
    </>
  );
};
