import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Loader,
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
import { ProjectType } from "@app/hooks/api/projects/types";
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
  const { isSubOrganization } = useOrganization();

  const {
    search,
    debouncedSearch,
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

  const projectSearch = debouncedSearch.trim();
  const { data, isPending } = useGetIdentityProjectMemberships(identityId, {
    limit: perPage,
    offset,
    orderDirection,
    // Certificate Manager membership is managed inside Certificate Manager, not as a project.
    excludeProjectType: ProjectType.CertificateManager,
    ...(projectSearch ? { search: projectSearch } : {})
  });
  const projectMemberships = data?.identityMemberships ?? [];
  const totalCount = data?.totalCount ?? 0;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  if (isPending) {
    return (
      // scott: todo proper loader
      <div className="flex h-40 w-full items-center justify-center">
        <Loader />
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
      {projectMemberships.length ? (
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
            {projectMemberships.map((membership) => {
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
              {projectSearch
                ? "No projects match this search"
                : "This machine identity is not a member of any projects"}
            </EmptyTitle>
            <EmptyDescription>
              {projectSearch
                ? "Adjust search filters to view project memberships."
                : "Assign this machine identity to a project."}
            </EmptyDescription>
            {!projectSearch && (
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
      {Boolean(projectMemberships.length) && (
        <Pagination
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
