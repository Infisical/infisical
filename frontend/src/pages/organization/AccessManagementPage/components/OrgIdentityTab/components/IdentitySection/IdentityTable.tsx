import { useCallback, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faChevronRight,
  faEdit,
  faEllipsisV,
  faFilter,
  faInfoCircle,
  faMagnifyingGlass,
  faServer,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { LastLoginSection } from "@app/components/organization/LastLoginSection";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
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
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge, OrgIcon, SubOrgIcon } from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import {
  identityAuthToNameMap,
  useGetOrgRoles,
  useSearchOrgIdentityMemberships,
  useUpdateOrgIdentity
} from "@app/hooks/api";
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

type Filter = {
  roles: string[];
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();

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
  } = usePagination<OrgIdentityOrderBy>(OrgIdentityOrderBy.Name, {
    initPerPage: getUserTablePreference("identityTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("identityTable", PreferenceKey.PerPage, newPerPage);
  };

  const [filter, setFilter] = useState<Filter>({
    roles: []
  });

  const organizationId = currentOrg?.id || "";

  const { mutateAsync: updateMutateAsync } = useUpdateOrgIdentity();

  const { data, isPending, isFetching } = useSearchOrgIdentityMemberships({
    offset,
    limit,
    orderDirection,
    orderBy,
    search: {
      name: debouncedSearch ? { $contains: debouncedSearch } : undefined,
      role: filter.roles?.length ? { $in: filter.roles } : undefined
    }
  });

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
    await updateMutateAsync({
      identityId,
      role,
      organizationId
    });

    createNotification({
      text: "Successfully updated identity role",
      type: "success"
    });
  };

  const handleRoleToggle = useCallback(
    (roleSlug: string) =>
      setFilter((state) => {
        const currentRoles = state.roles || [];

        if (currentRoles.includes(roleSlug)) {
          return { ...state, roles: currentRoles.filter((role) => role !== roleSlug) };
        }
        return { ...state, roles: [...currentRoles, roleSlug] };
      }),
    []
  );

  const isTableFiltered = Boolean(filter.roles.length);

  return (
    <div>
      <div className="mb-4 flex items-center space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Identities"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-9.5 w-[2.6rem] items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-0">
            <DropdownMenuLabel>Filter By</DropdownMenuLabel>
            <DropdownSubMenu>
              <DropdownSubMenuTrigger
                iconPos="right"
                icon={<FontAwesomeIcon icon={faChevronRight} size="sm" />}
              >
                Roles
              </DropdownSubMenuTrigger>
              <DropdownSubMenuContent className="max-h-80 thin-scrollbar overflow-y-auto rounded-l-none">
                <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                  Apply Roles to Filter Identities
                </DropdownMenuLabel>
                {roles?.map(({ id, slug, name }) => (
                  <DropdownMenuItem
                    onClick={(evt) => {
                      evt.preventDefault();
                      handleRoleToggle(slug);
                    }}
                    key={id}
                    icon={filter.roles.includes(slug) && <FontAwesomeIcon icon={faCheckCircle} />}
                    iconPos="right"
                  >
                    <div className="flex items-center">
                      <div
                        className="mr-2 h-2 w-2 rounded-full"
                        style={{ background: "#bec2c8" }}
                      />
                      {name}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownSubMenuContent>
            </DropdownSubMenu>
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities by name..."
        />
      </div>
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
              <Th>
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
              </Th>
              {isSubOrganization && <Th>Managed By</Th>}
              <Th className="w-16">{isFetching ? <Spinner size="xs" /> : null}</Th>
            </Tr>
          </THead>
          <TBody>
            {isPending && (
              <TableSkeleton columns={isSubOrganization ? 4 : 3} innerKey="org-identities" />
            )}
            {!isPending &&
              data?.identities?.map(
                ({
                  identity: { id, name, orgId },
                  role,
                  customRole,
                  lastLoginAuthMethod,
                  lastLoginTime
                }) => {
                  const isSubOrgIdentity = currentOrg.id === orgId;

                  return (
                    <Tr
                      className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                      key={`identity-${id}`}
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/identities/$identityId",
                          params: {
                            identityId: id,
                            orgId
                          }
                        })
                      }
                    >
                      <Td className="group">
                        {name}
                        {lastLoginAuthMethod && lastLoginTime && (
                          <Tooltip
                            className="max-w-96 min-w-52 px-3"
                            content={
                              <LastLoginSection
                                lastLoginAuthMethod={identityAuthToNameMap[lastLoginAuthMethod]}
                                lastLoginTime={lastLoginTime}
                              />
                            }
                          >
                            <FontAwesomeIcon
                              icon={faInfoCircle}
                              className="ml-2 text-mineshaft-400 opacity-0 transition-all group-hover:opacity-100"
                            />
                          </Tooltip>
                        )}
                      </Td>
                      <Td>
                        <OrgPermissionCan
                          I={OrgPermissionIdentityActions.Edit}
                          a={OrgPermissionSubjects.Identity}
                        >
                          {(isAllowed) => {
                            return (
                              <Select
                                value={role === "custom" ? (customRole?.slug as string) : role}
                                isDisabled={!isAllowed}
                                className="h-8 w-48 bg-mineshaft-700"
                                position="popper"
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
                      {isSubOrganization && (
                        <Td>
                          <Badge variant={isSubOrgIdentity ? "sub-org" : "org"}>
                            {isSubOrgIdentity ? (
                              <>
                                <SubOrgIcon />
                                Sub-Organization
                              </>
                            ) : (
                              <>
                                <OrgIcon />
                                Root Organization
                              </>
                            )}
                          </Badge>
                        </Td>
                      )}
                      <Td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              ariaLabel="Options"
                              className="w-6"
                              colorSchema="secondary"
                              variant="plain"
                            >
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <OrgPermissionCan
                              I={OrgPermissionIdentityActions.Edit}
                              a={OrgPermissionSubjects.Identity}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  icon={<FontAwesomeIcon icon={faEdit} />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate({
                                      to: "/organizations/$orgId/identities/$identityId",
                                      params: {
                                        identityId: id,
                                        orgId
                                      }
                                    });
                                  }}
                                  isDisabled={!isAllowed}
                                >
                                  Edit Identity {isSubOrgIdentity ? "" : "Membership"}
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                            <OrgPermissionCan
                              I={OrgPermissionIdentityActions.Delete}
                              a={OrgPermissionSubjects.Identity}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteIdentity", {
                                      identityId: id,
                                      name
                                    });
                                  }}
                                  isDisabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faTrash} />}
                                >
                                  {isSubOrgIdentity
                                    ? "Delete Identity"
                                    : "Remove From Sub-Organization"}
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                  );
                }
              )}
          </TBody>
        </Table>
        {!isPending && data && totalCount > 0 && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isPending && data && data?.identities.length === 0 && (
          <EmptyState
            title={
              debouncedSearch.trim().length > 0 || filter.roles?.length > 0
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
