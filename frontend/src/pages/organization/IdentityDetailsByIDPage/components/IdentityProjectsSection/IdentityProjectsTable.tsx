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
import { useGetIdentityProjectMemberships } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityProjectRow } from "./IdentityProjectRow";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIdentityFromProject", "addIdentityToProject"]>,
    data?: object
  ) => void;
};

enum IdentityProjectsOrderBy {
  Name = "name"
}

export const IdentityProjectsTable = ({ identityId, handlePopUpOpen }: Props) => {
  const { data: projectMemberships = [], isPending } = useGetIdentityProjectMemberships(identityId);

  const { isSubOrganization } = useOrganization();

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
  } = usePagination(IdentityProjectsOrderBy.Name, {
    initPerPage: getUserTablePreference("identityProjectsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("identityProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

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
      // scott: todo proper loader
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
              <TableHead onClick={toggleOrderDirection} className="w-1/3">
                Name
                <ChevronDownIcon
                  className={twMerge(
                    orderDirection === OrderByDirection.DESC && "rotate-180",
                    "transition-transform"
                  )}
                />
              </TableHead>

              <TableHead>Role</TableHead>
              <TableHead>Added On</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!isPending &&
              filteredProjectMemberships.slice(offset, perPage * page).map((membership) => {
                return (
                  <IdentityProjectRow
                    key={`identity-project-membership-${membership.id}`}
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
                : "This machine identity is not a member of any projects"}
            </EmptyTitle>
            <EmptyDescription>
              {projectMemberships.length
                ? "Adjust search filters to view project memberships."
                : "Assign this machine identity to a project."}
            </EmptyDescription>
            {!projectMemberships.length && (
              <EmptyContent>
                <Button
                  variant={isSubOrganization ? "sub-org" : "org"}
                  size="xs"
                  onClick={() => handlePopUpOpen("addIdentityToProject")}
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
