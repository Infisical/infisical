import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDownIcon, FilterIcon, HardDriveIcon, UserIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ConfirmActionModal, Lottie } from "@app/components/v2";
import {
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
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
import { useListGroupMembers } from "@app/hooks/api/groups/queries";
import {
  FilterMemberType,
  GroupMembersOrderBy,
  GroupMemberType,
  TGroupMembership
} from "@app/hooks/api/groups/types";

import { GroupMembershipIdentityRow } from "./GroupMembershipIdentityRow";
import { GroupMembershipUserRow } from "./GroupMembershipUserRow";

type Props = {
  groupMembership: TGroupMembership;
};

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
    toggleOrderDirection,
    orderBy
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

  const [memberTypeFilter, setMemberTypeFilter] = useState<FilterMemberType[]>([]);

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["assumePrivileges"] as const);

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("projectGroupMembersTable", PreferenceKey.PerPage, newPerPage);
  };

  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { data: groupMemberships, isPending } = useListGroupMembers({
    id: groupMembership.group.id,
    groupSlug: groupMembership.group.slug,
    offset,
    limit: perPage,
    search,
    orderBy,
    orderDirection,
    memberTypeFilter: memberTypeFilter.length > 0 ? memberTypeFilter : undefined
  });

  const isFiltered = Boolean(search) || memberTypeFilter.length > 0;

  const { members = [], totalCount = 0 } = groupMemberships ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const assumePrivileges = useAssumeProjectPrivileges();

  const handleAssumePrivileges = async () => {
    const { actorId, actorType } = popUp?.assumePrivileges?.data as {
      actorId: string;
      actorType: ActorType;
    };
    assumePrivileges.mutate(
      {
        actorId,
        actorType,
        projectId: currentProject.id
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text:
              actorType === ActorType.IDENTITY
                ? "Machine identity privilege assumption has started"
                : "User privilege assumption has started"
          });

          const url = getProjectHomePage(currentProject.type, currentProject.environments);
          window.location.assign(
            url.replace("$orgId", currentOrg.id).replace("$projectId", currentProject.id)
          );
        }
      }
    );
  };

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
      // scott: todo proper loader
      <div className="flex h-40 w-full items-center justify-center">
        <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-5 flex gap-2.5">
        {/* TODO(scott): add input group with icon once component added */}
        <UnstableInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search group members..."
        />
        <UnstableDropdownMenu>
          <UnstableDropdownMenuTrigger asChild>
            <UnstableIconButton variant={memberTypeFilter.length ? "project" : "outline"}>
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
      {members.length > 0 ? (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead className="w-5" />
              <UnstableTableHead className="w-1/2" onClick={toggleOrderDirection}>
                Name
                <ChevronDownIcon
                  className={twMerge(
                    orderDirection === OrderByDirection.DESC && "rotate-180",
                    "transition-transform"
                  )}
                />
              </UnstableTableHead>
              <UnstableTableHead>Joined Group</UnstableTableHead>
              <UnstableTableHead className="w-5" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {groupMemberships?.members?.map((userGroupMembership) => {
              return userGroupMembership.type === GroupMemberType.USER ? (
                <GroupMembershipUserRow
                  key={`user-group-membership-${userGroupMembership.id}`}
                  user={userGroupMembership}
                  onAssumePrivileges={(userId) =>
                    handlePopUpOpen("assumePrivileges", {
                      actorId: userId,
                      actorType: ActorType.USER
                    })
                  }
                />
              ) : (
                <GroupMembershipIdentityRow
                  key={`identity-group-membership-${userGroupMembership.id}`}
                  identity={userGroupMembership}
                  onAssumePrivileges={(identityId) =>
                    handlePopUpOpen("assumePrivileges", {
                      actorId: identityId,
                      actorType: ActorType.IDENTITY
                    })
                  }
                />
              );
            })}
          </UnstableTableBody>
        </UnstableTable>
      ) : (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {isFiltered
                ? "No group members match this search"
                : "This group doesn't have any members"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {isFiltered
                ? "Adjust search filters to view group members."
                : "Assign members from organization access control or contact an organization admin."}
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      )}
      {Boolean(totalCount) && (
        <UnstablePagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
      <ConfirmActionModal
        isOpen={popUp.assumePrivileges.isOpen}
        confirmKey="assume"
        title={`Do you want to assume privileges of this ${popUp.assumePrivileges?.data?.actorType === ActorType.IDENTITY ? "machine identity" : "user"}?`}
        subTitle={`This will set your privileges to those of the ${popUp.assumePrivileges?.data?.actorType === ActorType.IDENTITY ? "machine identity" : "user"} for the next hour.`}
        onChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
        onConfirmed={handleAssumePrivileges}
        buttonText="Confirm"
      />
    </>
  );
};
