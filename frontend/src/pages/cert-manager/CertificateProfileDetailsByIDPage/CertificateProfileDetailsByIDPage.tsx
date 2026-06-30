import { useState } from "react";
import { Helmet } from "react-helmet";
import { subject } from "@casl/ability";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { AccessRestrictedBanner, DeleteActionModal, PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  useDeleteCertificateProfile,
  useGetCertificateProfileById
} from "@app/hooks/api/certificateProfiles";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreateProfileModal } from "../PoliciesPage/components/CertificateProfilesTab/CreateProfileModal";
import { ProfileDefaultsSection, ProfileOverviewSection } from "./components";

const Page = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.CertificateProfileDetailsByIDPage.id
  });
  const { profileId } = params as { profileId: string };
  const search = useSearch({
    from: ROUTE_PATHS.CertManager.CertificateProfileDetailsByIDPage.id
  }) as { from?: "settings" | "application"; applicationName?: string };

  const { data: profile } = useGetCertificateProfileById({ profileId });
  const { mutateAsync: deleteProfile } = useDeleteCertificateProfile();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const projectId = currentProject?.id || "";

  const cameFromApplication = search.from === "application" && Boolean(search.applicationName);

  const navigateBack = () => {
    if (cameFromApplication && search.applicationName) {
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName",
        params: {
          orgId: currentOrg.id,
          projectId,
          applicationName: search.applicationName
        }
      });
      return;
    }

    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles",
      params: {
        orgId: currentOrg.id,
        projectId
      }
    });
  };

  const handleDeleteConfirm = async () => {
    if (!profile) return;

    try {
      await deleteProfile({ profileId: profile.id });

      createNotification({
        text: `Certificate profile "${profile.slug}" deleted successfully`,
        type: "success"
      });

      setIsDeleteModalOpen(false);
      navigateBack();
    } catch (error) {
      createNotification({
        text: `Failed to delete certificate profile: ${(error as Error)?.message || "Unknown error"}`,
        type: "error"
      });
    }
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {profile && (
        <ProjectPermissionCan
          I={ProjectPermissionCertificateProfileActions.Read}
          a={subject(ProjectPermissionSub.CertificateProfiles, { slug: profile.slug })}
        >
          {(isAllowed) =>
            isAllowed ? (
              <div className="mx-auto mb-6 w-full max-w-8xl">
                {cameFromApplication && search.applicationName ? (
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName"
                    params={{
                      orgId: currentOrg.id,
                      projectId,
                      applicationName: search.applicationName
                    }}
                    className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                    {search.applicationName}
                  </Link>
                ) : (
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/certificate-profiles"
                    params={{
                      orgId: currentOrg.id,
                      projectId
                    }}
                    className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                    Certificate Profiles
                  </Link>
                )}
                <PageHeader
                  scope={ProjectType.CertificateManager}
                  description="Manage certificate profile"
                  title={profile.slug}
                />
                <div className="flex flex-col gap-5 lg:flex-row">
                  <div className="w-full lg:max-w-[24rem]">
                    <ProfileOverviewSection
                      profile={profile}
                      onEdit={() => setIsEditModalOpen(true)}
                      onDelete={() => setIsDeleteModalOpen(true)}
                      backContext={{
                        from: search.from,
                        applicationName: search.applicationName
                      }}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-y-5">
                    <ProfileDefaultsSection profile={profile} />
                  </div>
                </div>

                <CreateProfileModal
                  isOpen={isEditModalOpen}
                  onClose={() => setIsEditModalOpen(false)}
                  profile={profile}
                  mode="edit"
                />

                <DeleteActionModal
                  isOpen={isDeleteModalOpen}
                  title={`Delete Certificate Profile ${profile.slug}?`}
                  onChange={(isOpen) => setIsDeleteModalOpen(isOpen)}
                  deleteKey={profile.slug}
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

export const CertificateProfileDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Certificate Profile</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
