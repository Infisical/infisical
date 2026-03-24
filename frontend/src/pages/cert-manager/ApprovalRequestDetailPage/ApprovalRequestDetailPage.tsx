import { Helmet } from "react-helmet";
import { faBan, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
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
  CodeSigningRequestData,
  useCancelApprovalRequest
} from "@app/hooks/api/approvalRequests";

import {
  ApprovalStepsSection,
  CertificateDetailsSection,
  RequestActionsSection
} from "./components";

const ROUTE_ID =
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approval-requests/$approvalRequestId" as const;

const CodeSigningDetailsSection = ({
  requestData,
  requesterName,
  requesterEmail
}: {
  requestData: CodeSigningRequestData;
  requesterName?: string;
  requesterEmail?: string;
}) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <h2 className="text-lg font-medium text-mineshaft-100">
          Signing access for {requestData.signerName}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mineshaft-700 text-sm font-medium text-mineshaft-200">
            {(requesterName || "U")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-mineshaft-100">{requesterName || "Unknown"}</p>
            {requesterEmail && <p className="text-sm text-mineshaft-400">{requesterEmail}</p>}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-5">
        <h3 className="mb-4 text-lg font-medium text-mineshaft-100">Signing Access Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-mineshaft-400">Signer</span>
            <p className="text-sm text-mineshaft-100">{requestData.signerName}</p>
          </div>
          {requestData.requestedWindowStart && requestData.requestedWindowEnd && (
            <>
              <div>
                <span className="text-xs text-mineshaft-400">Valid From</span>
                <p className="text-sm text-mineshaft-100">
                  {format(new Date(requestData.requestedWindowStart), "yyyy-MM-dd, hh:mm aaa")}
                </p>
              </div>
              <div>
                <span className="text-xs text-mineshaft-400">Valid Until</span>
                <p className="text-sm text-mineshaft-100">
                  {format(new Date(requestData.requestedWindowEnd), "yyyy-MM-dd, hh:mm aaa")}
                </p>
              </div>
            </>
          )}
          {requestData.requestedSignings && (
            <div>
              <span className="text-xs text-mineshaft-400">Allowed Sign Operations</span>
              <p className="text-sm text-mineshaft-100">{requestData.requestedSignings}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PageContent = () => {
  const { approvalRequestId } = useParams({ from: ROUTE_ID });
  const { policyType } = useSearch({ from: ROUTE_ID });
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { user: currentUser } = useUser();
  const cancelApprovalRequest = useCancelApprovalRequest();
  const navigate = useNavigate();
  const { handlePopUpOpen, handlePopUpToggle, popUp } = usePopUp(["cancelRequest"]);

  const resolvedPolicyType = policyType || ApprovalPolicyType.CertRequest;
  const isCodeSigning = resolvedPolicyType === ApprovalPolicyType.CertCodeSigning;

  const { data: request, isPending } = useQuery(
    approvalRequestQuery.getById({
      policyType: resolvedPolicyType,
      requestId: approvalRequestId
    })
  );

  const handleRequestCancel = async () => {
    if (cancelApprovalRequest.isPending || !request) return;

    await cancelApprovalRequest.mutateAsync(
      {
        requestId: request.id,
        policyType: resolvedPolicyType
      },
      {
        onSuccess: () => {
          createNotification({
            text: "Successfully cancelled request",
            type: "success"
          });
          navigate({
            to: isCodeSigning
              ? "/organizations/$orgId/projects/cert-manager/$projectId/code-signing"
              : "/organizations/$orgId/projects/cert-manager/$projectId/approvals",
            params: {
              orgId: currentProject.orgId,
              projectId: currentProject.id
            },
            search: isCodeSigning ? { tab: "approvals" } : undefined
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

  const renderTitle = () => {
    if (isCodeSigning) {
      const reqData = request.requestData.requestData as CodeSigningRequestData;
      return (
        <>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-mineshaft-100">Signing Request</h1>
            <Badge variant={getStatusBadgeVariant(request.status)}>
              {getStatusLabel(request.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-mineshaft-400">
            Signing request for signer{" "}
            <span className="font-medium text-mineshaft-200">{reqData.signerName}</span> by{" "}
            {request.requesterName || "Unknown"}
          </p>
        </>
      );
    }

    const reqData = request.requestData.requestData as CertRequestRequestData;
    return (
      <>
        <div className="flex items-center gap-3">
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
            {reqData.certificateRequest?.commonName || reqData.profileName}
          </span>{" "}
          by {request.requesterName || "Unknown"}
        </p>
      </>
    );
  };

  const renderDetailsSection = () => {
    if (isCodeSigning) {
      const reqData = request.requestData.requestData as CodeSigningRequestData;
      return (
        <CodeSigningDetailsSection
          requestData={reqData}
          requesterName={request.requesterName}
          requesterEmail={request.requesterEmail}
        />
      );
    }
    return <CertificateDetailsSection request={request} />;
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 font-inter text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Link
          to={
            isCodeSigning
              ? "/organizations/$orgId/projects/cert-manager/$projectId/code-signing"
              : "/organizations/$orgId/projects/cert-manager/$projectId/approvals"
          }
          params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          search={isCodeSigning ? { tab: "approvals" } : { section: "certificates" }}
          className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400 hover:text-mineshaft-200"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          {isCodeSigning ? "Signing Requests" : "Approvals List"}
        </Link>

        <div className="mb-6 flex items-start justify-between">
          <div>{renderTitle()}</div>
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
          <div className="flex flex-1 flex-col gap-4">{renderDetailsSection()}</div>
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
        <title>Approval Request | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
