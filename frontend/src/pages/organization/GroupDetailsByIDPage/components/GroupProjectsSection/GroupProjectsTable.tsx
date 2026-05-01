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
import { useListGroupProjects } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { FilterReturnedProjects } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupProjectRow } from "./GroupProjectRow";

type Props = {
  groupId: string;
  groupSlug: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeProjectFromGroup", "addGroupProjects"]>,
    data?: object
  ) => void;
  hideAddToProject?: boolean;
};

enum GroupProjectsOrderBy {
  Name = "name"
}

export const GroupProjectsTable = ({
  groupId,
  groupSlug,
  handlePopUpOpen,
  hideAddToProject = false
}: Props) => {
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
    orderBy,
    toggleOrderDirection
  } = usePagination(GroupProjectsOrderBy.Name, {
    initPerPage: getUserTablePreference("groupProjectsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("groupProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: groupMemberships, isPending } = useListGroupProjects({
    id: groupId,
    offset,
    limit: perPage,
    search: debouncedSearch,
    orderBy,
    orderDirection,
    filter: FilterReturnedProjects.ASSIGNED_PROJECTS
  });

  const totalCount = groupMemberships?.totalCount ?? 0;
  const projects = groupMemberships?.projects ?? [];

  useResetPageHelper({
    totalCount,
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
      {projects.length ? (
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
              <TableHead>Type</TableHead>
              <TableHead>Added On</TableHead>
              <TableHead className="w-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <GroupProjectRow
                key={`group-project-${project.id}`}
                project={project}
                handlePopUpOpen={handlePopUpOpen}
              />
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {debouncedSearch
                ? "No projects match this search"
                : "This group is not a member of any projects"}
            </EmptyTitle>
            <EmptyDescription>
              {debouncedSearch
                ? "Adjust search filters to view project memberships."
                : "Add this group to a project."}
            </EmptyDescription>
            {!debouncedSearch && !hideAddToProject && (
              <EmptyContent>
                <Button
                  variant={isSubOrganization ? "sub-org" : "org"}
                  size="xs"
                  onClick={() =>
                    handlePopUpOpen("addGroupProjects", {
                      groupId,
                      slug: groupSlug
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
      {Boolean(projects.length) && (
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
