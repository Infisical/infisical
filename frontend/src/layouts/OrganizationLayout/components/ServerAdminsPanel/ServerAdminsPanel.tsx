import { useState } from "react";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Input,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useGetOrgUsers } from "@app/hooks/api";

export const ServerAdminsPanel = () => {
  const [searchUserFilter, setSearchUserFilter] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchUserFilter, 500);
  const { currentOrg } = useOrganization();

  const { data: orgUsers, isPending } = useGetOrgUsers(currentOrg?.id || "");

  const adminUsers = orgUsers?.filter((orgUser) => {
    const isSuperAdmin = orgUser.user.superAdmin;
    const matchesSearch = debouncedSearchTerm
      ? orgUser.user.email?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        orgUser.user.firstName?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        orgUser.user.lastName?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      : true;
    return isSuperAdmin && matchesSearch;
  });

  const isEmpty = !isPending && (!adminUsers || adminUsers.length === 0);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 px-4">
        <Input
          value={searchUserFilter}
          onChange={(e) => setSearchUserFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search server admins..."
          className="w-full"
        />
      </div>
      <div className="flex-1 px-2">
        <TableContainer className="flex max-h-[30vh] flex-col overflow-auto">
          <Table className="w-full table-fixed">
            <THead className="sticky top-0 bg-bunker-800">
              <Tr>
                <Th className="w-1/2">Name</Th>
                <Th className="w-1/2">Email</Th>
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={2} innerKey="admins" />}
              {!isPending &&
                adminUsers?.map(({ user }) => {
                  const name =
                    user.firstName || user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.username;
                  return (
                    <Tr key={`admin-${user.id}`}>
                      <Td className="w-1/2 break-words">{name}</Td>
                      <Td className="w-1/2 break-words">{user.email}</Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {isEmpty && (
            <div className="flex h-32 items-center justify-center text-sm text-mineshaft-400">
              No server administrators found
            </div>
          )}
        </TableContainer>
      </div>
    </div>
  );
};
