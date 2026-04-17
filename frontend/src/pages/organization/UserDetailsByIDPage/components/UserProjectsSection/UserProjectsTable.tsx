import { useMemo } from "react";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Lottie } from "@app/components/v2";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Pagination,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetOrgMembershipProjectMemberships } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserProjectRow } from "./UserProjectRow";

type Props = {
  membershipId: string;
  username: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeUserFromProject", "addUserToProject"]>,
    data?: object
  ) => void;
  canAddToProject: boolean;
};

enum UserProjectsOrderBy {
  Name = "Name"
}

export const UserProjectsTable = ({
  membershipId,
  username,
  handlePopUpOpen,
  canAddToProject
}: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";
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
  } = usePagination(UserProjectsOrderBy.Name, {
    initPerPage: getUserTablePreference("userProjectsTable", PreferenceKey.PerPage, 10)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("userProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: projectMemberships = [], isPending } = useGetOrgMembershipProjectMemberships(
    orgId,
    membershipId
  );

  const filteredProjectMemberships = useMemo(
    () =>
      projectMemberships
        ?.filter((membership) =>
          membership.project.name.toLowerCase().includes(search.trim().toLowerCase())
        )
        .sort((a, b) => {
          const [membershipOne, membershipTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          return membershipOne.project.name
            .toLowerCase()
            .localeCompare(membershipTwo.project.name.toLowerCase());
        }),
    [projectMemberships, orderDirection, search]
  );

  useResetPageHelper({
    totalCount: filteredProjectMemberships.length,
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
      <Input
        className="mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search projects..."
      />
      {filteredProjectMemberships.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead onClick={toggleOrderDirection} className="w-2/3">
                Name
                <ChevronDownIcon
                  className={twMerge(
                    orderDirection === OrderByDirection.DESC && "rotate-180",
                    "transition-transform"
                  )}
                />
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProjectMemberships.slice(offset, perPage * page).map((membership) => {
              return (
                <UserProjectRow
                  key={`user-project-membership-${membership.id}`}
                  membership={membership}
                  handlePopUpOpen={handlePopUpOpen}
                />
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {projectMemberships.length
                ? "No projects match this search"
                : "This user is not a member of any projects"}
            </EmptyTitle>
            <EmptyDescription>
              {projectMemberships.length
                ? "Adjust search filters to view project memberships."
                : "Assign this user to a project."}
            </EmptyDescription>
            {!projectMemberships.length && canAddToProject && (
              <EmptyContent>
                <Button
                  variant={isSubOrganization ? "sub-org" : "org"}
                  size="xs"
                  onClick={() =>
                    handlePopUpOpen("addUserToProject", {
                      username
                    })
                  }
                >
                  <PlusIcon />
                  Add to Project
                </Button>
              </EmptyContent>
            )}
          </EmptyHeader>
        </Empty>
      )}
      {Boolean(filteredProjectMemberships.length) && (
        <Pagination
          count={filteredProjectMemberships.length}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
    </>
  );
};
