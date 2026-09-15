import { useState } from "react";
import { Search } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search server administrators"
            value={searchUserFilter}
            onChange={(e) => setSearchUserFilter(e.target.value)}
            placeholder="Search server admins..."
          />
        </InputGroup>
      </div>
      <div className="flex-1 px-2">
        <div className="flex max-h-[30vh] flex-col overflow-auto rounded-md">
          <Table containerClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 bg-container">
              <TableRow>
                <TableHead className="w-1/2">Name</TableHead>
                <TableHead className="w-1/2">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                ["first", "second", "third"].map((key) => (
                  <TableRow key={`admin-skeleton-${key}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isPending &&
                adminUsers?.map(({ user }) => {
                  const name =
                    user.firstName || user.lastName
                      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                      : user.username;
                  return (
                    <TableRow key={`admin-${user.id}`}>
                      <TableCell className="w-1/2 break-words whitespace-normal">{name}</TableCell>
                      <TableCell className="w-1/2 break-words whitespace-normal">
                        {user.email}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {isEmpty && (
            <div className="flex h-32 items-center justify-center rounded-md border border-border bg-container text-sm text-muted">
              No server administrators found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
