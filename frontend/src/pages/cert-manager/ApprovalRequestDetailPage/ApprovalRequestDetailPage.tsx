import { Helmet } from "react-helmet";
import { faBan, faCertificate, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { Button, ConfirmActionModal, ContentLoader, EmptyState } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useOrganization, useProject, useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  ApprovalRequestStatus,
  CertRequestRequestData,
  useCancelApprovalRequest
} from "@app/hooks/api/approvalRequests";

import {
  ApprovalStepsSection,
  CertificateDetailsSection,
  RequestActionsSection
} from "./components";

const PageContent = () => {
  const { approvalRequestId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approval-requests/$approvalRequestId"
  });
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { user: currentUser } = useUser();
  const cancelApprovalRequest = useCancelApprovalRequest();
  const navigate = useNavigate();
  const { handlePopUpOpen, handlePopUpToggle, popUp } = usePopUp(["cancelRequest"]);

  const { data: request, isPending } = useQuery(
    approvalRequestQuery.getById({
      policyType: ApprovalPolicyType.CertRequest,
      requestId: approvalRequestId
    })
  );

  const handleRequestCancel = async () => {
    if (cancelApprovalRequest.isPending || !request) return;

    await cancelApprovalRequest.mutateAsync(
      {
        requestId: request.id,
        policyType: ApprovalPolicyType.CertRequest
      },
      {
        onSuccess: () => {
          createNotification({
            text: "Successfully cancelled request",
            type: "success"
          });
          navigate({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/approvals",
            params: {
              orgId: currentProject.orgId,
              projectId: currentProject.id
            }
          });
        }
      }
    );
  };

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ContentLoader />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <EmptyState
          className="max-w-2xl rounded-md text-center"
          icon={faBan}
          title={`Could not find approval request with ID ${approvalRequestId}`}
        />
      </div>
    );
  }

  const requestData = request.requestData.requestData as CertRequestRequestData;

  const getStatusBadgeVariant = (status: ApprovalRequestStatus) => {
    switch (status) {
      case ApprovalRequestStatus.Pending:
        return "warning";
      case ApprovalRequestStatus.Approved:
        return "success";
      case ApprovalRequestStatus.Rejected:
        return "danger";
      default:
        return "neutral";
    }
  };

  const getStatusLabel = (status: ApprovalRequestStatus) => {
    switch (status) {
      case ApprovalRequestStatus.Pending:
        return "Pending Review";
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 font-inter text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Link
          to="/organizations/$orgId/projects/cert-manager/$projectId/approvals"
          params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400 hover:text-mineshaft-200"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Approvals List
        </Link>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faCertificate} className="text-xl text-primary" />
              <h1 className="text-2xl font-semibold text-mineshaft-100">
                Certificate Approval Request
              </h1>
              <Badge variant={getStatusBadgeVariant(request.status)}>
                {getStatusLabel(request.status)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-mineshaft-400">
              Certificate issuance request for{" "}
              <span className="font-medium text-mineshaft-200">
                {requestData.certificateRequest?.commonName || requestData.profileName}
              </span>{" "}
              by {request.requesterName || "Unknown"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-mineshaft-400">
              Requested {format(new Date(request.createdAt), "yyyy-MM-dd, hh:mm aaa")}
            </p>
            {request.requesterId === currentUser.id &&
              request.status === ApprovalRequestStatus.Pending && (
                <Button
                  onClick={() => handlePopUpOpen("cancelRequest")}
                  variant="outline_bg"
                  size="xs"
                  isLoading={cancelApprovalRequest.isPending}
                >
                  Cancel Request
                </Button>
              )}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-4 lg:flex-row">
          <div className="flex flex-1 flex-col gap-4">
            <CertificateDetailsSection request={request} />
          </div>
          <div className="flex flex-col gap-4 lg:w-96 lg:flex-shrink-0">
            <RequestActionsSection request={request} />
            <ApprovalStepsSection request={request} />
          </div>
        </div>
      </div>
      <ConfirmActionModal
        isOpen={popUp.cancelRequest.isOpen}
        confirmKey="cancel"
        title="Do you want to cancel this approval request?"
        onChange={(isOpen) => handlePopUpToggle("cancelRequest", isOpen)}
        onConfirmed={handleRequestCancel}
        buttonText="Confirm"
      />
    </div>
  );
};

export const ApprovalRequestDetailPage = () => {
  return (
    <>
      <Helmet>
        <title>Certificate Approval Request | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
