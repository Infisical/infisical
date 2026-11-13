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
import { TListActorProjectMembershipsParams } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserProjectRow } from "./UserProjectRow";

type Props = {
  membershipId: string;
  username: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeUserFromProject", "addUserToProduct"]>,
    data?: object
  ) => void;
  canAddToProduct: boolean;
};

enum UserProjectsOrderBy {
  Name = "Name"
}

const DEFAULT_PER_PAGE = 10;

export const getUserProjectsFirstPageParams = (): TListActorProjectMembershipsParams => ({
  limit: getUserTablePreference("userProjectsTable", PreferenceKey.PerPage, DEFAULT_PER_PAGE),
  offset: 0,
  orderDirection: OrderByDirection.ASC
});

export const UserProjectsTable = ({
  membershipId,
  username,
  handlePopUpOpen,
  canAddToProduct
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
  const { data, isPending, isError } = useGetOrgMembershipProjectMemberships(orgId, membershipId, {
    limit: perPage,
    offset,
    orderDirection,
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

  if (isError) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Could not load products</EmptyTitle>
          <EmptyDescription>Refresh the page to try again.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Input
        className="mb-4"
        maxLength={255}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search by project name..."
      />
      {projectMemberships.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Product</TableHead>
              <TableHead onClick={toggleOrderDirection} className="w-1/3">
                Project
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
                ? "No memberships match this search"
                : "This user does not have access to any products"}
            </EmptyTitle>
            <EmptyDescription>
              {projectSearch
                ? "Adjust search filters to view memberships."
                : "Add this user to a product to give them access."}
            </EmptyDescription>
            {!projectSearch && canAddToProduct && (
              <EmptyContent>
                <Button
                  variant={isSubOrganization ? "sub-org" : "org"}
                  size="xs"
                  onClick={() =>
                    handlePopUpOpen("addUserToProduct", {
                      username
                    })
                  }
                >
                  <PlusIcon />
                  Add to Product
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
