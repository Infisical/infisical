import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faArrowDown,
  faArrowUp,
  faEllipsis,
  faFilter,
  faMagnifyingGlass,
  faServer
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { OrgPermissionIdentityActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetOrgRoles, useSearchIdentities, useUpdateIdentity } from "@app/hooks/api";
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
  const navigate = useNavigate();
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
  } = usePagination<OrgIdentityOrderBy>(OrgIdentityOrderBy.Name, {
    initPerPage: getUserTablePreference("identityTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("identityTable", PreferenceKey.PerPage, newPerPage);
  };

  const [filteredRoles, setFilteredRoles] = useState<string[]>([]);

  const organizationId = currentOrg?.id || "";

  const { mutateAsync: updateMutateAsync } = useUpdateIdentity();

  const { data, isPending, isFetching } = useSearchIdentities({
    offset,
    limit,
    orderDirection,
    orderBy,
    search: {
      name: debouncedSearch ? { $contains: debouncedSearch } : undefined,
      role: filteredRoles?.length ? { $in: filteredRoles } : undefined
    }
  });

  const { totalCount = 0 } = data ?? {};
  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });
  const filterForm = useForm<{ roles: string }>();

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
      <div className="mb-4 flex items-center space-x-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities by name..."
        />
        <div>
          <Popover>
            <PopoverTrigger>
              <IconButton
                ariaLabel="filter"
                variant="outline_bg"
                className={filteredRoles?.length ? "border-primary" : ""}
              >
                <Tooltip content="Advance Filter">
                  <FontAwesomeIcon icon={faFilter} />
                </Tooltip>
              </IconButton>
            </PopoverTrigger>
            <PopoverContent className="w-auto border border-mineshaft-600 bg-mineshaft-800 p-2 drop-shadow-2xl">
              <div className="mb-4 border-b border-b-gray-700 pb-2 text-sm text-mineshaft-300">
                Advance Filter
              </div>
              <form
                onSubmit={filterForm.handleSubmit((el) => {
                  setFilteredRoles(el.roles?.split(",")?.filter(Boolean) || []);
                })}
              >
                <Controller
                  control={filterForm.control}
                  name="roles"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Roles"
                      helperText="Eg: admin,viewer"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
                <div className="flex items-center space-x-2">
                  <Button
                    type="submit"
                    size="xs"
                    colorSchema="primary"
                    variant="outline_bg"
                    className="mt-4"
                  >
                    Apply Filter
                  </Button>
                  {Boolean(filteredRoles.length) && (
                    <Button
                      size="xs"
                      variant="link"
                      className="ml-4 mt-4"
                      onClick={() => {
                        filterForm.reset({ roles: "" });
                        setFilteredRoles([]);
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </form>
            </PopoverContent>
          </Popover>
        </div>
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
            {isPending && <TableSkeleton columns={3} innerKey="org-identities" />}
            {!isPending &&
              data?.identities?.map(({ identity: { id, name }, role, customRole }) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`identity-${id}`}
                    onClick={() =>
                      navigate({
                        to: "/organization/identities/$identityId",
                        params: {
                          identityId: id
                        }
                      })
                    }
                  >
                    <Td>{name}</Td>
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
                        <DropdownMenuContent align="start" className="mt-3 p-1">
                          <OrgPermissionCan
                            I={OrgPermissionIdentityActions.Edit}
                            a={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate({
                                    to: "/organization/identities/$identityId",
                                    params: {
                                      identityId: id
                                    }
                                  });
                                }}
                                disabled={!isAllowed}
                              >
                                Edit Identity
                              </DropdownMenuItem>
                            )}
                          </OrgPermissionCan>
                          <OrgPermissionCan
                            I={OrgPermissionIdentityActions.Delete}
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
              debouncedSearch.trim().length > 0 || filteredRoles?.length > 0
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
