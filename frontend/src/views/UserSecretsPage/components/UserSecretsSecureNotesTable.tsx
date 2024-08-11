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
import { TUserSecret, useGetUserSecrets, UserSecretType } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserSecretsSecureNotesRow } from "./UserSecretsSecureNotesRow";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["showSecretData", "addOrUpdateUserSecret", "deleteUserSecretConfirmation"]
    >,
    popUpData: {
      keyName?: string;
      value?: string;
      name?: string;
      id?: string;
      isEditMode?: boolean;
      secretValue?: TUserSecret;
    }
  ) => void;
};

export const UserSecretsSecureNotesTable = ({ handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { isLoading, data } = useGetUserSecrets({
    offset: (page - 1) * perPage,
    limit: perPage,
    secretType: UserSecretType.SECURE_NOTE
  });
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Created At</Th>
            <Th>Note</Th>
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="user-secrets-secure-notes" />}
          {!isLoading &&
            data?.secrets?.map((row) => (
              <UserSecretsSecureNotesRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
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
        <EmptyState title="No secure notes found" icon={faKey} />
      )}
    </TableContainer>
  );
};
