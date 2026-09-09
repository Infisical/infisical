import { useState } from "react";
import { SearchIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
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

  const serverAdmins = orgUsers?.filter((orgUser) => orgUser.user.superAdmin) ?? [];

  const adminUsers = serverAdmins.filter((orgUser) => {
    if (!debouncedSearchTerm) return true;
    const term = debouncedSearchTerm.toLowerCase();
    return (
      orgUser.user.email?.toLowerCase().includes(term) ||
      orgUser.user.firstName?.toLowerCase().includes(term) ||
      orgUser.user.lastName?.toLowerCase().includes(term)
    );
  });

  const isEmpty = !isPending && adminUsers.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={searchUserFilter}
          onChange={(e) => setSearchUserFilter(e.target.value)}
          placeholder="Search server admins..."
        />
      </InputGroup>
      {isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, idx) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={`server-admins-skeleton-${idx}`} className="h-10 w-full" />
          ))}
        </div>
      )}
      {isEmpty && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {serverAdmins.length ? "No server admins match your search" : "No server admins"}
            </EmptyTitle>
            <EmptyDescription>
              {serverAdmins.length
                ? "Try a different name or email."
                : "Promote a user to server admin in the Admin Console to see them listed here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {!isPending && adminUsers.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/2">Name</TableHead>
              <TableHead className="w-1/2">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adminUsers.map(({ user }) => {
              const name =
                user.firstName || user.lastName
                  ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                  : user.username;
              return (
                <TableRow key={`admin-${user.id}`}>
                  <TableCell className="w-1/2 break-words">{name}</TableCell>
                  <TableCell className="w-1/2 break-words">{user.email}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
};
