import { useEffect, useState } from "react";
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
import { useDebounce } from "@app/hooks";
import { useGetIdentityMembershipOrgs, useGetOrgRoles, useUpdateIdentity } from "@app/hooks/api";
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

const INIT_PER_PAGE = 10;

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(INIT_PER_PAGE);
  const [direction, setDirection] = useState("asc");
  const [orderBy, setOrderBy] = useState("name");
  const [textFilter, setTextFilter] = useState("");
  const debouncedTextFilter = useDebounce(textFilter);

  const organizationId = currentOrg?.id || "";

  const { mutateAsync: updateMutateAsync } = useUpdateIdentity();

  const offset = (page - 1) * perPage;
  const { data, isLoading, isFetching } = useGetIdentityMembershipOrgs(
    {
      organizationId,
      offset,
      limit: perPage,
      direction,
      orderBy,
      textFilter: debouncedTextFilter
    },
    { keepPreviousData: true }
  );

  useEffect(() => {
    // reset page if no longer valid
    if (data && data.totalCount < offset) setPage(1);
  }, [data?.totalCount]);

  const { data: roles } = useGetOrgRoles(organizationId);

  const handleSort = (column: string) => {
    if (column === orderBy) {
      setDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setOrderBy(column);
    setDirection("asc");
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
        value={textFilter}
        onChange={(e) => setTextFilter(e.target.value)}
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
                    className={`ml-2 ${orderBy === "name" ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort("name")}
                  >
                    <FontAwesomeIcon
                      icon={direction === "desc" && orderBy === "name" ? faArrowUp : faArrowDown}
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Role
                  <IconButton
                    variant="plain"
                    className={`ml-2 ${orderBy === "role" ? "" : "opacity-30"}`}
                    ariaLabel="sort"
                    onClick={() => handleSort("role")}
                  >
                    <FontAwesomeIcon
                      icon={direction === "desc" && orderBy === "role" ? faArrowUp : faArrowDown}
                    />
                  </IconButton>
                </div>
              </Th>
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
                              className="w-40 bg-mineshaft-600"
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
        {!isLoading && data && data.totalCount > INIT_PER_PAGE && (
          <Pagination
            count={data.totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
          />
        )}
        {!isLoading && data && data?.identityMemberships.length === 0 && (
          <EmptyState
            title={
              debouncedTextFilter.trim().length > 0
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
