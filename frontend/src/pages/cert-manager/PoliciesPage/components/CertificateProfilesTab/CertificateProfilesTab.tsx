import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal } from "@app/components/v2";
import { useProjectPermission } from "@app/context";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  TCertificateProfileWithDetails,
  useDeleteCertificateProfile
} from "@app/hooks/api/certificateProfiles";

import { CreateProfileModal } from "./CreateProfileModal";
import { ProfileList } from "./ProfileList";

export const CertificateProfilesTab = () => {
  const { permission } = useProjectPermission();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<TCertificateProfileWithDetails | null>(
    null
  );

  const deleteProfile = useDeleteCertificateProfile();

  const canCreateProfile = permission.can(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.CertificateAuthorities
  );

  const handleCreateProfile = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditProfile = (profile: TCertificateProfileWithDetails) => {
    setSelectedProfile(profile);
    setIsEditModalOpen(true);
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
          <h2 className="text-xl font-semibold text-mineshaft-100">Certificate Profiles</h2>
          <p className="text-sm text-bunker-300">
            Unified certificate issuance configurations combining CA, template, and enrollment
            method
          </p>
        </div>

        {canCreateProfile && (
          <Button
            colorSchema="primary"
            type="button"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={handleCreateProfile}
          >
            Create Profile
          </Button>
        )}
      </div>

      <ProfileList onEditProfile={handleEditProfile} onDeleteProfile={handleDeleteProfile} />

      <CreateProfileModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

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
