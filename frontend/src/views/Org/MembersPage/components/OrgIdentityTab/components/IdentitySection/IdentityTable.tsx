import { useRouter } from "next/router";
import {
  faArrowDown,
  faArrowUp,
  faEllipsis,
  faMagnifyingGlass,
  faServer
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetIdentityMembershipOrgs, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { OrgIdentityOrderBy } from "@app/hooks/api/organization/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteIdentity"]>,
    data?: {
      identityId: string;
      name: string;
    }
  ) => void;
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const router = useRouter();
  const { currentOrg } = useOrganization();

  const {
    offset,
    limit,
    orderBy,
    setOrderBy,
    orderDirection,
    setOrderDirection,
    search,
    debouncedSearch,
    setPage,
    setSearch,
    perPage,
    page,
    setPerPage
  } = usePagination<OrgIdentityOrderBy>(OrgIdentityOrderBy.Name);

  const organizationId = currentOrg?.id || "";

  const { mutateAsync: updateMutateAsync } = useUpdateIdentity();

  const { data, isLoading, isFetching } = useGetIdentityMembershipOrgs(
    {
      organizationId,
      offset,
      limit,
      orderDirection,
      orderBy,
      search: debouncedSearch
    },
    { keepPreviousData: true }
  );

  const { totalCount = 0 } = data ?? {};
  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { data: roles } = useGetOrgRoles(organizationId);

  const handleSort = (column: OrgIdentityOrderBy) => {
    if (column === orderBy) {
      setOrderDirection((prev) =>
        prev === OrderByDirection.ASC ? OrderByDirection.DESC : OrderByDirection.ASC
      );
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const handleChangeRole = async ({ identityId, role }: { identityId: string; role: string }) => {
    try {
      await updateMutateAsync({
        identityId,
        role,
        organizationId
      });

      createNotification({
        text: "Successfully updated identity role",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to update identity role";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <div>
      <Input
        containerClassName="mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search identities by name..."
      />
      <TableContainer>
        <Table>
          <THead>
            <Tr className="h-14">
              <Th className="w-1/2">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === OrgIdentityOrderBy.Name ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrgIdentityOrderBy.Name)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgIdentityOrderBy.Name
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>Role</Th>
              {/* <Th>
                <div className="flex items-center">
                  Role
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === OrgIdentityOrderBy.Role ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrgIdentityOrderBy.Role)}
                  >
                    <FontAwesomeIcon
                      icon={
                        orderDirection === OrderByDirection.DESC &&
                        orderBy === OrgIdentityOrderBy.Role
                          ? faArrowUp
                          : faArrowDown
                      }
                    />
                  </IconButton>
                </div>
              </Th> */}
              <Th className="w-16">{isFetching ? <Spinner size="xs" /> : null}</Th>
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={3} innerKey="org-identities" />}
            {!isLoading &&
              data?.identityMemberships.map(({ identity: { id, name }, role, customRole }) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`identity-${id}`}
                    onClick={() => router.push(`/org/${organizationId}/identities/${id}`)}
                  >
                    <Td>{name}</Td>
                    <Td>
                      <OrgPermissionCan
                        I={OrgPermissionActions.Edit}
                        a={OrgPermissionSubjects.Identity}
                      >
                        {(isAllowed) => {
                          return (
                            <Select
                              value={role === "custom" ? (customRole?.slug as string) : role}
                              isDisabled={!isAllowed}
                              className="w-48 bg-mineshaft-600"
                              dropdownContainerClassName="border border-mineshaft-600 bg-mineshaft-800"
                              onValueChange={(selectedRole) =>
                                handleChangeRole({
                                  identityId: id,
                                  role: selectedRole
                                })
                              }
                            >
                              {(roles || []).map(({ slug, name: roleName }) => (
                                <SelectItem value={slug} key={`owner-option-${slug}`}>
                                  {roleName}
                                </SelectItem>
                              ))}
                            </Select>
                          );
                        }}
                      </OrgPermissionCan>
                    </Td>
                    <Td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="flex justify-center hover:text-primary-400 data-[state=open]:text-primary-400">
                            <FontAwesomeIcon size="sm" icon={faEllipsis} />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/org/${organizationId}/identities/${id}`);
                                }}
                                disabled={!isAllowed}
                              >
                                Edit Identity
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                          <OrgPermissionCan
                            I={OrgPermissionActions.Delete}
                            a={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  isAllowed
                                    ? "hover:!bg-red-500 hover:!text-white"
                                    : "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteIdentity", {
                                    identityId: id,
                                    name
                                  });
                                }}
                                disabled={!isAllowed}
                              >
                                Delete Identity
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isLoading && data && totalCount > 0 && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
        {!isLoading && data && data?.identityMemberships.length === 0 && (
          <EmptyState
            title={
              debouncedSearch.trim().length > 0
                ? "No identities match search filter"
                : "No identities have been created in this organization"
            }
            icon={faServer}
          />
        )}
      </TableContainer>
    </div>
  );
};
