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
  const [debounedSearchTerm] = useDebounce(searchUserFilter, 500);
  const { currentOrg } = useOrganization();

  const { data: orgUsers, isPending } = useGetOrgUsers(currentOrg?.id || "");

  const adminUsers = orgUsers?.filter((orgUser) => {
    const isSuperAdmin = orgUser.user.superAdmin;
    const matchesSearch = debounedSearchTerm
      ? orgUser.user.email?.toLowerCase().includes(debounedSearchTerm.toLowerCase()) ||
        orgUser.user.firstName?.toLowerCase().includes(debounedSearchTerm.toLowerCase()) ||
        orgUser.user.lastName?.toLowerCase().includes(debounedSearchTerm.toLowerCase())
      : true;
    return isSuperAdmin && matchesSearch;
  });

  const isEmpty = !isPending && (!adminUsers || adminUsers.length === 0);

  return (
    <div className="flex flex-col">
      <div className="mb-4 px-4">
        <Input
          value={searchUserFilter}
          onChange={(e) => setSearchUserFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search server admins..."
          className="w-full"
        />
      </div>
      <div className="mb-2 w-full px-2">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-1/2">Name</Th>
                <Th className="w-1/2">Email</Th>
              </Tr>
            </THead>
            <TBody className="h-full">
              {isPending && <TableSkeleton columns={2} innerKey="admins" />}
              {!isPending &&
                adminUsers?.map(({ user }) => {
                  const name =
                    user.firstName || user.lastName
                      ? `${user.firstName} ${user.lastName}`
                      : user.username;
                  return (
                    <Tr key={`admin-${user.id}`} className="w-full">
                      <Td className="w-1/2 truncate">{name}</Td>
                      <Td className="w-1/2 truncate">{user.email}</Td>
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
