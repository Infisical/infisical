import { faKey } from "@fortawesome/free-solid-svg-icons";

import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useGetSharedSecrets } from "@app/hooks/api/secretSharing";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ShareSecretsRow } from "./ShareSecretsRow";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSharedSecretConfirmation"]>,
    {
      name,
      id
    }: {
      name: string;
      id: string;
    }
  ) => void;
};

export const ShareSecretsTable = ({ handlePopUpOpen }: Props) => {
  const { isLoading, data = [] } = useGetSharedSecrets();
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Encrypted Secret</Th>
            <Th>Created</Th>
            <Th>Valid Until</Th>
            <Th>Views Left</Th>
            <Th aria-label="button" className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="shared-secrets" />}
          {!isLoading &&
            data?.map((row) => (
              <ShareSecretsRow key={row.id} row={row} handlePopUpOpen={handlePopUpOpen} />
            ))}
          {!isLoading && data?.length === 0 && (
            <Tr>
              <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
                <EmptyState title="No secrets shared yet" icon={faKey} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
