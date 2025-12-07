import { Helmet } from "react-helmet";
import { faBan, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { ContentLoader, EmptyState, PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies";
import { approvalRequestQuery } from "@app/hooks/api/approvalRequests";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ApprovalStepsSection, RequestActionsSection, RequestDetailsSection } from "./components";

const PageContent = () => {
  const { approvalRequestId } = useParams({
    from: ROUTE_PATHS.Pam.ApprovalRequestDetailPage.id
  });
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { data: request, isPending } = useQuery(
    approvalRequestQuery.getById({
      policyType: ApprovalPolicyType.PamAccess,
      requestId: approvalRequestId
    })
  );

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

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 font-inter text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Link
          to="/organizations/$orgId/projects/pam/$projectId/approvals"
          params={{ orgId: currentOrg.id, projectId: currentProject.id }}
          className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Approvals List
        </Link>
        <PageHeader
          scope={ProjectType.PAM}
          title="Approval Request"
          description={`Request to access account ${request.requestData.requestData.accountPath} for ${request.requestData.requestData.requestDurationSeconds} by ${request.requesterName || "Unknown"}`}
        />
        <div className="flex justify-center gap-4">
          <div className="flex w-96 flex-col gap-4">
            <RequestDetailsSection request={request} />
            <RequestActionsSection request={request} />
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <ApprovalStepsSection request={request} />
          </div>
        </div>
      </div>
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
