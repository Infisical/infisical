import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TCertificateProfileWithDetails,
  useDeleteCertificateProfile
} from "@app/hooks/api/certificateProfiles";

import { CreateProfileModal } from "./CreateProfileModal";
import { ProfileList } from "./ProfileList";
import { RevealAcmeEabSecretModal } from "./RevealAcmeEabSecretModal";

export const CertificateProfilesTab = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRevealProfileAcmeEabSecretModalOpen, setIsRevealProfileAcmeEabSecretModalOpen] =
    useState(false);
  const [selectedProfile, setSelectedProfile] = useState<TCertificateProfileWithDetails | null>(
    null
  );
  const { popUp, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const deleteProfile = useDeleteCertificateProfile();

  const handleCreateProfile = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditProfile = (profile: TCertificateProfileWithDetails) => {
    setSelectedProfile(profile);
    setIsEditModalOpen(true);
  };

  const handleRevealProfileAcmeEabSecret = (profile: TCertificateProfileWithDetails) => {
    setSelectedProfile(profile);
    setIsRevealProfileAcmeEabSecretModalOpen(true);
  };

  const handleDeleteProfile = (profile: TCertificateProfileWithDetails) => {
    setSelectedProfile(profile);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedProfile) return;

    await deleteProfile.mutateAsync({
      profileId: selectedProfile.id
    });
    setIsDeleteModalOpen(false);
    setSelectedProfile(null);
    createNotification({
      text: `Certificate profile "${selectedProfile.slug}" deleted successfully`,
      type: "success"
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-x-2">
            <h2 className="text-xl font-semibold text-mineshaft-100">Certificate Profiles</h2>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/certificates/profiles" />
          </div>
          <p className="text-sm text-bunker-300">
            Unified certificate issuance configurations combining CA, template, and enrollment
            method
          </p>
        </div>

        <ProjectPermissionCan
          I={ProjectPermissionCertificateProfileActions.Create}
          a={ProjectPermissionSub.CertificateProfiles}
        >
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              colorSchema="primary"
              type="button"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={handleCreateProfile}
            >
              Create Profile
            </Button>
          )}
        </ProjectPermissionCan>
      </div>

      <ProfileList
        onEditProfile={handleEditProfile}
        onRevealProfileAcmeEabSecret={handleRevealProfileAcmeEabSecret}
        onDeleteProfile={handleDeleteProfile}
      />

      <CreateProfileModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
        text="Your current plan does not include access to managing template enrollment options for ACME. To unlock this feature, please upgrade to Infisical Enterprise plan."
      />

      {selectedProfile && (
        <>
          <CreateProfileModal
            isOpen={isEditModalOpen}
            onClose={() => {
              setIsEditModalOpen(false);
              setSelectedProfile(null);
            }}
            profile={selectedProfile}
            mode="edit"
          />

          {selectedProfile.enrollmentType === "acme" && (
            <RevealAcmeEabSecretModal
              isOpen={isRevealProfileAcmeEabSecretModalOpen}
              onClose={() => {
                setIsRevealProfileAcmeEabSecretModalOpen(false);
                setSelectedProfile(null);
              }}
              profile={selectedProfile}
            />
          )}

          <DeleteActionModal
            isOpen={isDeleteModalOpen}
            title={`Delete Certificate Profile ${selectedProfile.slug}?`}
            onChange={(isOpen) => {
              setIsDeleteModalOpen(isOpen);
              if (!isOpen) {
                setSelectedProfile(null);
              }
            }}
            deleteKey={selectedProfile.slug}
            onDeleteApproved={handleDeleteConfirm}
          />
        </>
      )}
    </div>
  );
};
