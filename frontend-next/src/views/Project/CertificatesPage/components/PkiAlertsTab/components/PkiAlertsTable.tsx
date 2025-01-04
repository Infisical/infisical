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
import { useListWorkspacePkiAlerts } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { PkiAlertRow } from "./PkiAlertRow";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["pkiAlert", "deletePkiAlert"]>,
    data?: {}
  ) => void;
};

export const PkiAlertsTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data, isLoading } = useListWorkspacePkiAlerts({
    workspaceId: projectId
  });

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Alert Name</Th>
            <Th>Alert Before Days</Th>
            <Th>Certificate Collection</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="project-pki-alerts" />}
          {!isLoading &&
            data?.alerts.map((alert) => {
              return (
                <PkiAlertRow
                  key={`alert-${alert.id}`}
                  alert={alert}
                  handlePopUpOpen={handlePopUpOpen}
                />
              );
            })}
        </TBody>
      </Table>
      {!isLoading && !data?.alerts?.length && (
        <EmptyState title="No alerts have been created for any certificate collections" icon={faExclamationCircle} />
      )}
    </TableContainer>
  );
};
