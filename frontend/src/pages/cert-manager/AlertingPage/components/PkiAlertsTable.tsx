import { CircleAlertIcon } from "lucide-react";

import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useListWorkspacePkiAlerts } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { PkiAlertRow } from "./PkiAlertRow";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["pkiAlert", "deletePkiAlert"]>,
    data?: object
  ) => void;
};

export const PkiAlertsTable = ({ handlePopUpOpen }: Props) => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";

  const { data, isPending } = useListWorkspacePkiAlerts({
    projectId
  });

  if (!isPending && !data?.alerts?.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>No alerts have been created for any certificate collections</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Alert Name</TableHead>
          <TableHead>Alert Before Days</TableHead>
          <TableHead>Certificate Collection</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending && <TableSkeletonRows columns={4} />}
        {!isPending &&
          data?.alerts.map((alert) => {
            return (
              <PkiAlertRow
                key={`alert-${alert.id}`}
                alert={alert}
                handlePopUpOpen={handlePopUpOpen}
              />
            );
          })}
      </TableBody>
    </Table>
  );
};
