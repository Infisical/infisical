import { useEffect, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFilter,
  faFolder,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { HardDriveIcon, UserIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  ConfirmActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
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

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search members..."
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Members"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                memberTypeFilter.length > 0 && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            sideOffset={2}
            className="max-h-[70vh] thin-scrollbar overflow-y-auto"
            align="end"
          >
            <DropdownMenuLabel>Filter by Member Type</DropdownMenuLabel>
            {filterOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                className="flex items-center gap-2"
                iconPos="right"
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
                icon={
                  memberTypeFilter.includes(option.value) && (
                    <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                  )
                }
              >
                <div className="flex items-center gap-2">
                  {option.icon}
                  {option.label}
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-5" />
              <Th className="w-1/2 pl-2">
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
      </TableContainer>
      <ConfirmActionModal
        isOpen={popUp.assumePrivileges.isOpen}
        confirmKey="assume"
        title={`Do you want to assume privileges of this ${popUp.assumePrivileges?.data?.actorType === ActorType.IDENTITY ? "machine identity" : "user"}?`}
        subTitle={`This will set your privileges to those of the ${popUp.assumePrivileges?.data?.actorType === ActorType.IDENTITY ? "machine identity" : "user"} for the next hour.`}
        onChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
        onConfirmed={handleAssumePrivileges}
        buttonText="Confirm"
      />
    </div>
  );
};
