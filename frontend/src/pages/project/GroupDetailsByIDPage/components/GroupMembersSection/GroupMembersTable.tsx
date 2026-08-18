import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDownIcon, FilterIcon, HardDriveIcon, SearchIcon, UserIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { AssumePrivilegesModal } from "@app/components/assume-privileges";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
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
    <>
      <div className="mb-5 flex gap-2.5">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search group members..."
            aria-label="Search group members"
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              variant={memberTypeFilter.length ? "project" : "outline"}
              aria-label="Filter group members"
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by Member Type</DropdownMenuLabel>
            {filterOptions.map((option) => (
              <DropdownMenuCheckboxItem
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
                {option.icon}
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isPending || members.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-5">
                <span className="sr-only">Member Type</span>
              </TableHead>
              <TableHead
                className="w-1/2"
                aria-sort={orderDirection === OrderByDirection.ASC ? "ascending" : "descending"}
                onClick={toggleOrderDirection}
              >
                Name
                <ChevronDownIcon
                  className={twMerge(
                    orderDirection === OrderByDirection.DESC && "rotate-180",
                    "transition-transform"
                  )}
                />
              </TableHead>
              <TableHead>Joined Group</TableHead>
              <TableHead className="w-5">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending
              ? Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`member-skeleton-${index + 1}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
                ))
              : groupMemberships?.members?.map((userGroupMembership) => {
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
          </TableBody>
        </Table>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {isFiltered
                ? "No group members match your filters"
                : "This group doesn't have any members"}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered
                ? "Adjust your search or filters to view group members."
                : "Assign members from organization access control or contact an organization admin."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!isPending && Boolean(totalCount) && (
        <Pagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
      <AssumePrivilegesModal
        isOpen={popUp.assumePrivileges.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
        actorType={(popUp.assumePrivileges.data as { actorType: ActorType })?.actorType}
        actorId={(popUp.assumePrivileges.data as { actorId: string })?.actorId}
      />
    </>
  );
};
