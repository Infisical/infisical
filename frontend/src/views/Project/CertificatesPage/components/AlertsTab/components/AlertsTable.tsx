import { faExclamationCircle } from "@fortawesome/free-solid-svg-icons";

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
import { useWorkspace } from "@app/context";
import { useListWorkspaceAlerts } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AlertRow } from "./AlertRow";

type Props = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["alert", "deleteAlert"]>, data?: {}) => void;
};

export const AlertsTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isLoading } = useListWorkspaceAlerts({
    workspaceId: projectId
  });

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Alert Name</Th>
            <Th>Alert Before Days</Th>
            <Th>Bound PKI Collection</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="project-alerts" />}
          {!isLoading &&
            data?.alerts.map((alert) => {
              return (
                <AlertRow
                  key={`alert-${alert.id}`}
                  alert={alert}
                  handlePopUpOpen={handlePopUpOpen}
                />
              );
            })}
        </TBody>
      </Table>
      {!isLoading && !data?.alerts?.length && (
        <EmptyState title="No alerts have been created" icon={faExclamationCircle} />
      )}
    </TableContainer>
  );
};
