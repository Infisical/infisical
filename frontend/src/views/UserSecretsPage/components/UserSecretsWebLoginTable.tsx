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

import { UserSecretsWebLoginRow } from "./UserSecretsWebLoginRow";

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

export const UserSecretsWebLoginTable = ({ handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const { isLoading, data } = useGetUserSecrets({
    offset: (page - 1) * perPage,
    limit: perPage,
    secretType: UserSecretType.WEB_LOGIN
  });
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Created At</Th>
            <Th>Username</Th>
            <Th>Password</Th>
            <Th>Login Url</Th>
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={6} innerKey="user-secrets-web-logins" />}
          {!isLoading &&
            data?.secrets?.map((row) => (
              <UserSecretsWebLoginRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
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
        <EmptyState title="No web login secrets found" icon={faKey} />
      )}
    </TableContainer>
  );
};
