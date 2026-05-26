import { useState } from "react";
import { Helmet } from "react-helmet";
import { subject } from "@casl/ability";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { AccessRestrictedBanner, DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  useDeleteCertificatePolicy,
  useGetCertificatePolicyById
} from "@app/hooks/api/certificatePolicies";
import { useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreatePolicyModal } from "../PoliciesPage/components/CertificatePoliciesTab/CreatePolicyModal";
import {
  PolicyAlgorithmsSection,
  PolicyDetailsSection,
  PolicyKeyUsagesSection,
  PolicySansRulesSection,
  PolicySubjectRulesSection,
  PolicyValiditySection
} from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.CertificatePolicyDetailsByIDPage.id
  });
  const { policyId } = params as { policyId: string };
  const search = useSearch({
    from: ROUTE_PATHS.CertManager.CertificatePolicyDetailsByIDPage.id
  }) as { from?: "settings" | "profile"; profileId?: string };

  const { data: policy } = useGetCertificatePolicyById({ policyId });
  const { mutateAsync: deletePolicy } = useDeleteCertificatePolicy();

  const cameFromProfile = search.from === "profile" && Boolean(search.profileId);

  const { data: sourceProfile } = useGetCertificateProfileById({
    profileId: cameFromProfile && search.profileId ? search.profileId : ""
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const projectId = currentProject?.id || "";

  const handleDeleteConfirm = async () => {
    if (!policy) return;

    await deletePolicy({ policyId: policy.id });

    createNotification({
      text: `Certificate policy "${policy.name}" deleted successfully`,
      type: "success"
    });

    setIsDeleteModalOpen(false);
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/settings",
      params: {
        orgId: currentOrg.id,
        projectId
      },
      search: { selectedTab: "certificate-policies" }
    });
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {policy && (
        <ProjectPermissionCan
          I={ProjectPermissionCertificatePolicyActions.Read}
          a={subject(ProjectPermissionSub.CertificatePolicies, { name: policy.name })}
        >
          {(isAllowed) =>
            isAllowed ? (
              <div className="mx-auto mb-6 w-full max-w-8xl">
                {cameFromProfile && search.profileId ? (
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles/$profileId"
                    params={{
                      orgId: currentOrg.id,
                      projectId,
                      profileId: search.profileId
                    }}
                    className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                    {sourceProfile?.slug || "Certificate Profile"}
                  </Link>
                ) : (
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/settings"
                    params={{
                      orgId: currentOrg.id,
                      projectId
                    }}
                    search={{ selectedTab: "certificate-policies" }}
                    className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                    Certificate Policies
                  </Link>
                )}
                <PageHeader
                  scope={ProjectType.CertificateManager}
                  description="Manage certificate policy"
                  title={policy.name}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        Options
                        <EllipsisIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <ProjectPermissionCan
                        I={ProjectPermissionCertificatePolicyActions.Edit}
                        a={subject(ProjectPermissionSub.CertificatePolicies, {
                          name: policy.name
                        })}
                      >
                        {(canEdit) => (
                          <DropdownMenuItem
                            isDisabled={!canEdit}
                            onClick={() => setIsEditModalOpen(true)}
                          >
                            Edit Policy
                          </DropdownMenuItem>
                        )}
                      </ProjectPermissionCan>
                      <ProjectPermissionCan
                        I={ProjectPermissionCertificatePolicyActions.Delete}
                        a={subject(ProjectPermissionSub.CertificatePolicies, {
                          name: policy.name
                        })}
                      >
                        {(canDelete) => (
                          <DropdownMenuItem
                            variant="danger"
                            isDisabled={!canDelete}
                            onClick={() => setIsDeleteModalOpen(true)}
                          >
                            Delete Policy
                          </DropdownMenuItem>
                        )}
                      </ProjectPermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </PageHeader>
                <div className="flex flex-col gap-5 lg:flex-row">
                  <div className="w-full lg:max-w-[24rem]">
                    <PolicyDetailsSection policy={policy} />
                  </div>
                  <div className="flex flex-1 flex-col gap-y-5">
                    <PolicyValiditySection policy={policy} />
                    <PolicySubjectRulesSection policy={policy} />
                    <PolicySansRulesSection policy={policy} />
                    <PolicyKeyUsagesSection policy={policy} />
                    <PolicyAlgorithmsSection policy={policy} />
                  </div>
                </div>

                <CreatePolicyModal
                  isOpen={isEditModalOpen}
                  onClose={() => setIsEditModalOpen(false)}
                  policy={policy}
                  mode="edit"
                />

                <DeleteActionModal
                  isOpen={isDeleteModalOpen}
                  title={`Delete Certificate Policy ${policy.name}?`}
                  onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
                  deleteKey={policy.name}
                  onDeleteApproved={handleDeleteConfirm}
                />
              </div>
            ) : (
              <div className="container mx-auto flex h-full items-center justify-center">
                <AccessRestrictedBanner />
              </div>
            )
          }
        </ProjectPermissionCan>
      )}
    </div>
  );
};

export const CertificatePolicyDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Certificate Policy</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
