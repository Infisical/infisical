import { useState } from "react";
import { Helmet } from "react-helmet";
import { faBan, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ConfirmActionModal, ContentLoader, EmptyState } from "@app/components/v2";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton
} from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission, useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApproverType
} from "@app/hooks/api/approvalPolicies";
import {
  approvalRequestQuery,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  CertRequestRequestData,
  CodeSigningRequestData,
  useCancelApprovalRequest
} from "@app/hooks/api/approvalRequests";
import { useGetPkiApplicationById } from "@app/hooks/api/pkiApplications";
import {
  CodeSigningScopeField,
  codeSigningScopeFieldLabels,
  MONOSPACED_SCOPE_FIELDS,
  useRemoveSignerRequestScopeFields
} from "@app/hooks/api/signers";

import {
  ApprovalStepsSection,
  CertificateDetailsSection,
  RequestActionsSection
} from "./components";

const ROUTE_ID =
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approvals/$approvalRequestId" as const;

const CodeSigningDetailsSection = ({
  requestData,
  requesterName,
  requesterEmail,
  requestId,
  canEditScope
}: {
  requestData: CodeSigningRequestData;
  requesterName?: string;
  requesterEmail?: string;
  requestId: string;
  canEditScope: boolean;
}) => {
  const removeScopeFields = useRemoveSignerRequestScopeFields();
  const [fieldToRemove, setFieldToRemove] = useState<CodeSigningScopeField | null>(null);

  const handleRemove = async () => {
    if (!fieldToRemove) return;
    try {
      await removeScopeFields.mutateAsync({
        signerId: requestData.signerId,
        requestId,
        removeFields: [fieldToRemove]
      });
      setFieldToRemove(null);
    } catch {
      // The mutation cache reports the failure
    }
  };

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
          {requestData.requestedWindowDuration && (
            <div>
              <span className="text-xs text-mineshaft-400">Access Duration</span>
              <p className="text-sm text-mineshaft-100">
                {requestData.requestedWindowDuration} from approval
              </p>
            </div>
          )}
          {requestData.requestedSignings && (
            <div>
              <span className="text-xs text-mineshaft-400">Allowed Sign Operations</span>
              <p className="text-sm text-mineshaft-100">{requestData.requestedSignings}</p>
            </div>
          )}
        </div>
        {requestData.scope && Object.values(requestData.scope).some(Boolean) && (
          <div className="mt-4 border-t border-mineshaft-600 pt-4">
            <h4 className="mb-1 text-sm font-medium text-mineshaft-100">Request Scope</h4>
            <p className="mb-3 text-xs text-mineshaft-400">
              Signing is only allowed when every parameter below matches exactly.
            </p>
            <div className="flex flex-col gap-4">
              {Object.values(CodeSigningScopeField)
                .filter((field) => requestData.scope?.[field])
                .map((field) => (
                  <div key={field} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs text-mineshaft-400">
                        {codeSigningScopeFieldLabels[field]}
                      </span>
                      <p
                        className={twMerge(
                          "text-sm break-all text-mineshaft-100",
                          MONOSPACED_SCOPE_FIELDS.includes(field) && "font-mono text-xs"
                        )}
                      >
                        {requestData.scope?.[field]}
                      </p>
                    </div>
                    {canEditScope && (
                      <IconButton
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        aria-label={`Stop enforcing ${codeSigningScopeFieldLabels[field]}`}
                        onClick={() => setFieldToRemove(field)}
                      >
                        <XIcon className="size-4" />
                      </IconButton>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(fieldToRemove)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setFieldToRemove(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {fieldToRemove
                ? `Stop enforcing ${codeSigningScopeFieldLabels[fieldToRemove]}?`
                : "Stop enforcing this parameter?"}
            </DialogTitle>
            <DialogDescription>
              Signing will be allowed whatever value this parameter takes. The other parameters
              still have to match.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFieldToRemove(null)} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRemove}
              isPending={removeScopeFields.isPending}
              className="flex-1"
            >
              Stop enforcing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PageContent = () => {
  const { approvalRequestId } = useParams({ from: ROUTE_ID });
  const { policyType, applicationName, signerId, from } = useSearch({ from: ROUTE_ID });
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { user: currentUser } = useUser();
  const { memberships } = useProjectPermission();
  const userGroupIds = memberships.map((membership) => membership.actorGroupId).filter(Boolean);
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

  const requestApplicationId =
    request?.scopeType === ApprovalPolicyScope.PkiApplication ? (request.scopeId ?? "") : "";
  const { data: requestApplication } = useGetPkiApplicationById(requestApplicationId);

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
          if (applicationName) {
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName",
              params: {
                orgId: currentProject.orgId,
                projectId: currentProject.id,
                applicationName
              },
              search: { selectedTab: "requests" }
            });
            return;
          }
          if (from === "root-requests") {
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/requests",
              params: { orgId: currentProject.orgId, projectId: currentProject.id }
            });
            return;
          }
          if (signerId) {
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/code-signing/$signerId",
              params: {
                orgId: currentOrg.id,
                projectId: currentProject.id,
                signerId
              },
              search: { selectedTab: "approvals" }
            });
            return;
          }
          navigate({
            to: isCodeSigning
              ? "/organizations/$orgId/projects/cert-manager/$projectId/code-signing"
              : "/organizations/$orgId/projects/cert-manager/$projectId/approvals",
            params: {
              orgId: currentProject.orgId,
              projectId: currentProject.id
            },
            search: undefined
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
          {requestApplication && (
            <>
              {" "}
              on application{" "}
              <Link
                to="/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName"
                params={{
                  orgId: currentOrg.id,
                  projectId: currentProject.id,
                  applicationName: requestApplication.name
                }}
                className="font-medium text-mineshaft-200 underline hover:text-mineshaft-100"
              >
                {requestApplication.name}
              </Link>
            </>
          )}
        </p>
      </>
    );
  };

  const renderDetailsSection = () => {
    if (isCodeSigning) {
      const reqData = request.requestData.requestData as CodeSigningRequestData;
      const currentStep = request.steps.find(
        (step) => step.status === ApprovalRequestStepStatus.InProgress
      );
      const isCurrentStepApprover = Boolean(
        currentStep?.approvers.some((approver) =>
          approver.type === ApproverType.User
            ? approver.id === currentUser?.id
            : userGroupIds.includes(approver.id)
        )
      );
      return (
        <CodeSigningDetailsSection
          requestData={reqData}
          requesterName={request.requesterName}
          requesterEmail={request.requesterEmail}
          requestId={request.id}
          canEditScope={request.status === ApprovalRequestStatus.Pending && isCurrentStepApprover}
        />
      );
    }
    return <CertificateDetailsSection request={request} />;
  };

  const renderBackLink = () => {
    const linkClass =
      "mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400 hover:text-mineshaft-200";

    if (applicationName) {
      return (
        <Link
          to="/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName"
          params={{
            orgId: currentOrg.id,
            projectId: currentProject.id,
            applicationName
          }}
          search={{ selectedTab: "requests" }}
          className={linkClass}
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Go back to Application
        </Link>
      );
    }

    if (from === "root-requests") {
      return (
        <Link
          to="/organizations/$orgId/projects/cert-manager/$projectId/requests"
          params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          className={linkClass}
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Requests
        </Link>
      );
    }

    if (signerId) {
      return (
        <Link
          to="/organizations/$orgId/projects/cert-manager/$projectId/code-signing/$signerId"
          params={{
            orgId: currentOrg.id,
            projectId: currentProject.id,
            signerId
          }}
          search={{ selectedTab: "approvals" }}
          className={linkClass}
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Back to Signer
        </Link>
      );
    }

    return (
      <Link
        to={
          isCodeSigning
            ? "/organizations/$orgId/projects/cert-manager/$projectId/code-signing"
            : "/organizations/$orgId/projects/cert-manager/$projectId/approvals"
        }
        params={{ orgId: currentOrg.id, projectId: currentProject.id }}
        search={isCodeSigning ? undefined : { section: "certificates" }}
        className={linkClass}
      >
        <FontAwesomeIcon icon={faChevronLeft} />
        {isCodeSigning ? "Signing Requests" : "Approvals List"}
      </Link>
    );
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 font-inter text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        {renderBackLink()}

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
                  variant="outline"
                  size="xs"
                  isPending={cancelApprovalRequest.isPending}
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
