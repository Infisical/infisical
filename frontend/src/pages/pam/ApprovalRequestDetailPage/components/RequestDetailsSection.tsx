import { format } from "date-fns";

import { Badge } from "@app/components/v3";
import { GenericFieldLabel } from "@app/components/v2";
import { ApprovalRequestStatus, TApprovalRequest } from "@app/hooks/api/approvalRequests";

type Props = {
  request: TApprovalRequest;
};

const getStatusBadgeColor = (status: ApprovalRequestStatus) => {
  switch (status) {
    case ApprovalRequestStatus.Pending:
      return "project";
    case ApprovalRequestStatus.Approved:
      return "success";
    case ApprovalRequestStatus.Rejected:
      return "danger";
    case ApprovalRequestStatus.Expired:
      return "neutral";
    default:
      return "neutral";
  }
};

export const RequestDetailsSection = ({ request }: Props) => {
  const { accountPath, accessDuration } = request.requestData.requestData;

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-500 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Request Details</h3>
      </div>
      <div>
        <div className="space-y-3">
          <GenericFieldLabel label="Status">
            <Badge className="capitalize" variant={getStatusBadgeColor(request.status)}>
              {request.status}
            </Badge>
          </GenericFieldLabel>
          <GenericFieldLabel label="Requester Name">
            {request.requesterName || "Unknown"}
          </GenericFieldLabel>
          <GenericFieldLabel label="Requester Email">{request.requesterEmail}</GenericFieldLabel>
          <GenericFieldLabel label="Account Path">{accountPath}</GenericFieldLabel>
          <GenericFieldLabel label="Duration">{accessDuration}</GenericFieldLabel>
          {request.justification && (
            <GenericFieldLabel label="Justification">
              <p className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
                {request.justification}
              </p>
            </GenericFieldLabel>
          )}
          <GenericFieldLabel label="Requested At">
            {format(new Date(request.createdAt), "yyyy-MM-dd, hh:mm aaa")}
          </GenericFieldLabel>
          {request.expiresAt && (
            <GenericFieldLabel label="Expires">
              {format(new Date(request.expiresAt), "yyyy-MM-dd, hh:mm aaa")}
            </GenericFieldLabel>
          )}
        </div>
      </div>
    </div>
  );
};
