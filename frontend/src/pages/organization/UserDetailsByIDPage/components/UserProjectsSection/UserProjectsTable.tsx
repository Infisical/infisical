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
import { useGetOrgMembershipProjectMemberships } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType, TListActorProjectMembershipsParams } from "@app/hooks/api/projects/types";
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

const DEFAULT_PER_PAGE = 10;

export const getUserProjectsFirstPageParams = (): TListActorProjectMembershipsParams => ({
  limit: getUserTablePreference("userProjectsTable", PreferenceKey.PerPage, DEFAULT_PER_PAGE),
  offset: 0,
  orderDirection: OrderByDirection.ASC,
  excludeProjectType: ProjectType.CertificateManager
});

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
    debouncedSearch,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    toggleOrderDirection
  } = usePagination(UserProjectsOrderBy.Name, {
    initPerPage: getUserTablePreference(
      "userProjectsTable",
      PreferenceKey.PerPage,
      DEFAULT_PER_PAGE
    )
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("userProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const projectSearch = debouncedSearch.trim();
  const { data, isPending } = useGetOrgMembershipProjectMemberships(orgId, membershipId, {
    limit: perPage,
    offset,
    orderDirection,
    // Certificate Manager membership is managed inside Certificate Manager, not as a project.
    excludeProjectType: ProjectType.CertificateManager,
    ...(projectSearch ? { search: projectSearch } : {})
  });
  const projectMemberships = data?.memberships ?? [];
  const totalCount = data?.totalCount ?? 0;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  if (isPending) {
    return (
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
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search projects..."
      />
      {projectMemberships.length ? (
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
            {projectMemberships.map((membership) => {
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
              {projectSearch
                ? "No projects match this search"
                : "This user is not a member of any projects"}
            </EmptyTitle>
            <EmptyDescription>
              {projectSearch
                ? "Adjust search filters to view project memberships."
                : "Assign this user to a project."}
            </EmptyDescription>
            {!projectSearch && canAddToProject && (
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
