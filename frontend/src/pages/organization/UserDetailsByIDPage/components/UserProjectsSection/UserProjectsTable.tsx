import { useMemo } from "react";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Lottie } from "@app/components/v2";
import {
  Button,
  UnstableEmpty,
  UnstableEmptyContent,
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
      <UnstableInput
        className="mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search projects..."
      />
      {filteredProjectMemberships.length ? (
        <UnstableTable>
          <UnstableTableHeader>
            <UnstableTableRow>
              <UnstableTableHead onClick={toggleOrderDirection} className="w-2/3">
                Name
                <ChevronDownIcon
                  className={twMerge(
                    orderDirection === OrderByDirection.DESC && "rotate-180",
                    "transition-transform"
                  )}
                />
              </UnstableTableHead>
              <UnstableTableHead>Role</UnstableTableHead>
              <UnstableTableHead className="w-5" />
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {filteredProjectMemberships.slice(offset, perPage * page).map((membership) => {
              return (
                <UserProjectRow
                  key={`user-project-membership-${membership.id}`}
                  membership={membership}
                  handlePopUpOpen={handlePopUpOpen}
                />
              );
            })}
          </UnstableTableBody>
        </UnstableTable>
      ) : (
        <UnstableEmpty className="border">
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>
              {projectMemberships.length
                ? "No projects match this search"
                : "This user is not a member of any projects"}
            </UnstableEmptyTitle>
            <UnstableEmptyDescription>
              {projectMemberships.length
                ? "Adjust search filters to view project memberships."
                : "Assign this user to a project."}
            </UnstableEmptyDescription>
            {!projectMemberships.length && canAddToProject && (
              <UnstableEmptyContent>
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
              </UnstableEmptyContent>
            )}
          </UnstableEmptyHeader>
        </UnstableEmpty>
      )}
      {Boolean(filteredProjectMemberships.length) && (
        <UnstablePagination
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
