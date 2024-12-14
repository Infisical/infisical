import { faKey } from "@fortawesome/free-solid-svg-icons";

import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { UserSecretsRow } from "./UserSecretsRow";
import { useGetUserSecrets } from "@app/hooks/api/userSecrets";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteUserSecretsConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
};

export const UserSecretsTable = ({ handlePopUpOpen }: Props) => {
  const { isLoading, data } = useGetUserSecrets();
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Title</Th> 
            <Th>Content</Th>
            <Th>Username</Th>
            <Th>Password</Th>
            <Th>Card Number</Th>
            <Th>Expiry Date</Th>
            <Th>CVV</Th> 
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
      {!isLoading && !data?.secrets?.length && (
        <EmptyState title="No secrets shared yet" icon={faKey} />
      )}
    </TableContainer>
  );
};
