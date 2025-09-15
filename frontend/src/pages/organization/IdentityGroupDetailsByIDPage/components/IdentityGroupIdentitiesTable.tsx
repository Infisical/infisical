import { useState } from "react";
import { faEllipsisV, faMagnifyingGlass, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

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
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionIdentityGroupActions, OrgPermissionSubjects } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useListIdentityGroupIdentities } from "@app/hooks/api";
import { EFilterReturnedIdentities } from "@app/hooks/api/identity-groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  identityGroupId: string;
  identityGroupSlug: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIdentityFromGroup"]>,
    data?: {
      identityId: string;
      identityName: string;
    }
  ) => void;
};

export const IdentityGroupIdentitiesTable = ({
  identityGroupId,
  identityGroupSlug,
  handlePopUpOpen
}: Props) => {
  const { search, setSearch, setPage, page, perPage, setPerPage, offset } = usePagination("name", {
    initPerPage: getUserTablePreference("identityGroupIdentitiesTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("identityGroupIdentitiesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending } = useListIdentityGroupIdentities({
    id: identityGroupId,
    identityGroupSlug,
    offset,
    limit: perPage,
    search,
    filter: EFilterReturnedIdentities.EXISTING_MEMBERS
  });

  const identities = data?.identities || [];
  const totalCount = data?.totalCount || 0;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search identities..."
            className="w-64"
          />
        </div>
      </div>

      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Auth Method</Th>
              <Th>Joined</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="identity-group-identities" />}
            {!isPending && identities.length === 0 && (
              <Tr>
                <Td colSpan={4}>
                  <EmptyState title="No identities found" icon={faMagnifyingGlass} />
                </Td>
              </Tr>
            )}
            {!isPending &&
              identities.map(({ id, name, authMethod, joinedGroupAt }) => {
                return (
                  <Tr className="h-10" key={`identity-${id}`}>
                    <Td>{name}</Td>
                    <Td>{authMethod || "N/A"}</Td>
                    <Td>{new Date(joinedGroupAt).toLocaleDateString()}</Td>
                    <Td>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <IconButton ariaLabel="more" variant="plain" className="group relative">
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </IconButton>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="p-1">
                          <OrgPermissionCan
                            I={OrgPermissionIdentityGroupActions.Edit}
                            a={OrgPermissionSubjects.IdentityGroups}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  isAllowed
                                    ? "hover:!bg-red-500 hover:!text-white"
                                    : "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={async () => {
                                  handlePopUpOpen("removeIdentityFromGroup", {
                                    identityId: id,
                                    identityName: name
                                  });
                                }}
                                disabled={!isAllowed}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                                Remove from Group
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
      </TableContainer>

      <Pagination
        count={totalCount}
        page={page}
        perPage={perPage}
        onChangePage={setPage}
        onChangePerPage={handlePerPageChange}
      />
    </div>
  );
};
