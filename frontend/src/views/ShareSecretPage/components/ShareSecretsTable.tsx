import { useEffect, useState } from "react";
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
import { useWorkspace } from "@app/context";
import { TSharedSecret, useGetSharedSecrets } from "@app/hooks/api/secretSharing";
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
  showExpiredSharedSecrets: boolean;
};

export const ShareSecretsTable = ({ handlePopUpOpen, showExpiredSharedSecrets }: Props) => {
  const [tableData, setTableData] = useState<TSharedSecret[]>([]);
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const { isLoading, data = [] } = useGetSharedSecrets(workspaceId);

  useEffect(() => {
    if (!isLoading) {
      if (!showExpiredSharedSecrets) {
        setTableData(data.filter((secret) => new Date(secret.expiresAt) > new Date()));
      } else {
        setTableData(data);
      }
    }
  }, [isLoading, data, showExpiredSharedSecrets]);

  const handleSecretExpiration = () => {
    if (!showExpiredSharedSecrets) {
      setTableData(
        data.filter((secret) => !secret.expiresAt || new Date(secret.expiresAt) > new Date())
      );
    }
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Secret Name</Th> <Th>Created</Th> <Th>Valid Until</Th>
            <Th aria-label="button" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="shared-secrets" />}
          {!isLoading &&
            tableData &&
            tableData.map((row) => (
              <ShareSecretsRow
                key={row.id}
                row={row}
                handlePopUpOpen={handlePopUpOpen}
                onSecretExpiration={handleSecretExpiration}
              />
            ))}
          {!isLoading && tableData && tableData?.length === 0 && (
            <Tr>
              <Td colSpan={4} className="bg-mineshaft-800 text-center text-bunker-400">
                <EmptyState title="No secrets shared yet!" icon={faKey} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
