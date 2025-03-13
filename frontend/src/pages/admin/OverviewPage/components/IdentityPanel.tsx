import { useState } from "react";
import { faMagnifyingGlass, faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  EmptyState,
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
import { useDebounce } from "@app/hooks";
import { useAdminGetIdentities } from "@app/hooks/api/admin/queries";

const IdentityPanelTable = () => {
  const [searchIdentityFilter, setSearchIdentityFilter] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchIdentityFilter, 500);

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useAdminGetIdentities(
    {
      limit: 20,
      searchTerm: debouncedSearchTerm
    }
  );

  const isEmpty = !isPending && !data?.pages?.[0].length;

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={searchIdentityFilter}
          onChange={(e) => setSearchIdentityFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities by name..."
          className="flex-1"
        />
      </div>
      <div className="mt-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={2} innerKey="identities" />}
              {!isPending &&
                data?.pages?.map((identities) =>
                  identities.map(({ name, id }) => (
                    <Tr key={`identity-${id}`} className="w-full">
                      <Td>{name}</Td>
                    </Tr>
                  ))
                )}
            </TBody>
          </Table>
          {!isPending && isEmpty && <EmptyState title="No identities found" icon={faServer} />}
        </TableContainer>
        {!isEmpty && (
          <Button
            className="mt-4 py-3 text-sm"
            isFullWidth
            variant="star"
            isLoading={isFetchingNextPage}
            isDisabled={isFetchingNextPage || !hasNextPage}
            onClick={() => fetchNextPage()}
          >
            {hasNextPage ? "Load More" : "End of list"}
          </Button>
        )}
      </div>
    </>
  );
};

export const IdentityPanel = () => (
  <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
    <div className="mb-4">
      <p className="text-xl font-semibold text-mineshaft-100">Identities</p>
    </div>
    <IdentityPanelTable />
  </div>
);
