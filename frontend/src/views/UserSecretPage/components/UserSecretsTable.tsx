import { useState } from "react";
import { faFolderBlank } from "@fortawesome/free-solid-svg-icons";

import {
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { TUserSecret, useGetUserSecrets } from "@app/hooks/api/userSecrets";

import { UserSecretsRow } from "./UserSecretsRow";

type TUserSecretsTable = {
  handlePopUpOpen(popUpName: "createUserSecret"): void;
  handlePopUpOpen(
    popUpName: "deleteUserSecretConfirmation",
    args: {
      name: string;
      id: string;
    }
  ): void;
  handlePopUpOpen(popUpName: "viewSecret", args: TUserSecret): void;
};

const INIT_PER_PAGE = 20;

export const UserSecretsTable = ({ handlePopUpOpen }: TUserSecretsTable) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(INIT_PER_PAGE);
  const { isLoading, data } = useGetUserSecrets({
    offset: (page - 1) * perPage,
    limit: perPage
  });
  return (
    <div className="thin-scrollbar mt-4">
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Created At</Th>
              <Th aria-label="button" className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && (
              <TableSkeleton className="bg-mineshaft/5" columns={4} innerKey="user-secrets" />
            )}
            {!isLoading &&
              data?.secrets?.map((row) => (
                <UserSecretsRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
              ))}
            {!isLoading && !data?.secrets?.length && (
              <Tr>
                <Td colSpan={4}>
                  <EmptyState title={"Let's add some secrets"} icon={faFolderBlank} iconSize="3x" />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
        {!isLoading &&
          data?.secrets &&
          data?.totalCount >= perPage &&
          data?.totalCount !== undefined && (
            <Pagination
              count={data.totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
      </TableContainer>
    </div>
  );
};
