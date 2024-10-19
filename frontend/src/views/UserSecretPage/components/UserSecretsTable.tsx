import { useState } from "react";
import { faKey } from "@fortawesome/free-solid-svg-icons";

import {
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useGetSharedSecrets } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserSecretsRow } from "./UserSecretsRow";


// type Props = {
//   handlePopUpOpen: (
//     popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation"]>,
//     {
//       name,
//       id
//     }: {
//       name: string;
//       id: string;
//     }
//   ) => void;
// };

type UserSecretsTableProps = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["editCredentials", "deleteSharedSecretConfirmation"]>, data?: any) => void;
  // credentials: TUserSecret[];
};

export const UserSecretsTable = ({ handlePopUpOpen}:UserSecretsTableProps) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { isLoading, data } = useGetSharedSecrets({
    offset: (page - 1) * perPage,
    limit: perPage
  });
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            {/* <Th className="w-5" /> */}
            <Th>Name</Th>
            <Th>Credential Type</Th>
            <Th>Created At</Th>
            <Th>Updated At</Th>
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={7} innerKey="shared-secrets" />}
          {!isLoading &&
            data?.secrets?.map((row) => (
              <UserSecretsRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
            ))}
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
      {!isLoading && !data?.secrets?.length && (
        <EmptyState title="No secrets shared yet" icon={faKey} />
      )}
    </TableContainer>
  );
};
