import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import {
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  TCertificateProfileWithDetails,
  useDeleteCertificateProfile
} from "@app/hooks/api/certificateProfiles";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { CreateProfileModal } from "./CreateProfileModal";
import { ProfileList } from "./ProfileList";

export const CertificateProfilesTab = () => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<TCertificateProfileWithDetails | null>(
    null
  );
  const { popUp, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const deleteProfile = useDeleteCertificateProfile();

  const handleEditProfile = (profile: TCertificateProfileWithDetails) => {
    setSelectedProfile(profile);
    setIsEditModalOpen(true);
  };

  const handleCloneProfile = (profile: TCertificateProfileWithDetails) => {
    setSelectedProfile(profile);
    setIsCloneModalOpen(true);
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
    <Card>
      <CardHeader>
        <CardTitle>
          Certificate Profiles
          <DocumentationLinkBadge href={PkiDocsUrls.settings.profiles} />
        </CardTitle>
        <CardDescription>
          Reusable presets for issuing certificates. Each profile combines a certificate authority
          (who signs the certificate) with a policy (the rules and settings applied).
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionCertificateProfileActions.Create}
            a={ProjectPermissionSub.CertificateProfiles}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                isDisabled={!isAllowed}
                onClick={() => setIsCreateModalOpen(true)}
              >
                <PlusIcon />
                Create Profile
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ProfileList
          onEditProfile={handleEditProfile}
          onCloneProfile={handleCloneProfile}
          onDeleteProfile={handleDeleteProfile}
        />
      </CardContent>

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

          <CreateProfileModal
            isOpen={isCloneModalOpen}
            onClose={() => {
              setIsCloneModalOpen(false);
              setSelectedProfile(null);
            }}
            profile={selectedProfile}
            mode="clone"
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
    </Card>
  );
};
