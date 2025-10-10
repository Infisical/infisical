import { useEffect, useState } from "react";
import { faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  TextArea
} from "@app/components/v2";
import { useProject } from "@app/context";
import { useListCasByProjectId } from "@app/hooks/api/ca/queries";
import {
  TCertificateProfileWithDetails,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles";
import { useListCertificateTemplatesV2 } from "@app/hooks/api/certificateTemplates/queries";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: TCertificateProfileWithDetails;
}

export const EditProfileModal = ({ isOpen, onClose, profile }: Props) => {
  const { currentProject } = useProject();
  const updateProfile = useUpdateCertificateProfile();

  const { data: caData } = useListCasByProjectId(currentProject?.id || "");
  const { data: templateData } = useListCertificateTemplatesV2({
    projectId: currentProject?.id || "",
    limit: 100,
    offset: 0
  });

  const certificateAuthorities = caData || [];
  const certificateTemplates = templateData?.certificateTemplates || [];

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    enrollmentType: "api" as "api" | "est",
    certificateAuthorityId: "",
    certificateTemplateId: "",
    estConfig: {
      disableBootstrapCaValidation: false,
      passphrase: "",
      caChain: ""
    },
    apiConfig: {
      autoRenew: false,
      autoRenewDays: 30
    }
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name,
        slug: profile.slug,
        description: profile.description || "",
        enrollmentType: profile.enrollmentType,
        certificateAuthorityId: profile.caId,
        certificateTemplateId: profile.certificateTemplateId,
        estConfig: {
          disableBootstrapCaValidation: profile.estConfig?.disableBootstrapCaValidation || false,
          passphrase: "",
          caChain: ""
        },
        apiConfig: {
          autoRenew: profile.apiConfig?.autoRenew || false,
          autoRenewDays: profile.apiConfig?.autoRenewDays || 30
        }
      });
    }
  }, [profile]);

  const handleInputChange = (field: string, value: string | boolean | number) => {
    if (field.includes(".")) {
      const [parent, child] = field.split(".");
      setFormData((prev) => ({
        ...prev,
        [parent]: {
          ...(prev as any)[parent],
          [child]: value
        }
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      return;
    }

    try {
      const payload: any = {
        profileId: profile.id,
        name: formData.name,
        description: formData.description
      };

      if (formData.enrollmentType === "est") {
        payload.estConfig = {
          disableBootstrapCaValidation: formData.estConfig.disableBootstrapCaValidation,
          passphrase: formData.estConfig.passphrase,
          caChain: formData.estConfig.caChain
        };
      } else if (formData.enrollmentType === "api") {
        payload.apiConfig = {
          autoRenew: formData.apiConfig.autoRenew,
          autoRenewDays: formData.apiConfig.autoRenewDays
        };
      }

      await updateProfile.mutateAsync(payload);

      createNotification({
        text: "Certificate profile updated successfully",
        type: "success"
      });

      onClose();
    } catch (error) {
      console.error("Error updating profile:", error);
      createNotification({
        text: "Failed to update certificate profile",
        type: "error"
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose}>
      <ModalContent
        title="Edit Certificate Profile"
        subTitle={`Update configuration for ${profile?.name}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormControl label="Profile Name" isRequired>
            <Input
              placeholder="Enter profile name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
            />
          </FormControl>

          <FormControl label="Profile Slug" isRequired>
            <Input
              placeholder="profile-slug"
              value={formData.slug}
              onChange={(e) => handleInputChange("slug", e.target.value)}
              disabled
            />
          </FormControl>

          <FormControl label="Description">
            <TextArea
              placeholder="Enter profile description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              rows={3}
            />
          </FormControl>

          <FormControl label="Enrollment Type">
            <Select
              value={formData.enrollmentType}
              onValueChange={(value) => handleInputChange("enrollmentType", value)}
              isDisabled
            >
              <SelectItem value="api">API - Programmatic certificate enrollment</SelectItem>
              <SelectItem value="est">EST - RFC 7030 certificate enrollment</SelectItem>
            </Select>
          </FormControl>

          <FormControl label="Certificate Authority">
            <Select
              value={formData.certificateAuthorityId}
              onValueChange={(value) => handleInputChange("certificateAuthorityId", value)}
              placeholder="Select a certificate authority"
              isDisabled
            >
              {certificateAuthorities.map((ca: any) => (
                <SelectItem key={ca.id} value={ca.id}>
                  {ca.friendlyName || ca.name || ca.commonName}
                </SelectItem>
              ))}
            </Select>
          </FormControl>

          <FormControl label="Certificate Template">
            <Select
              value={formData.certificateTemplateId}
              onValueChange={(value) => handleInputChange("certificateTemplateId", value)}
              placeholder="Select a certificate template"
              isDisabled
            >
              {certificateTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>

          {/* EST Configuration */}
          {formData.enrollmentType === "est" && (
            <div className="space-y-4 rounded border border-mineshaft-600 p-4">
              <FormControl>
                <Checkbox
                  id="disableBootstrapCaValidation"
                  isChecked={formData.estConfig.disableBootstrapCaValidation}
                  onCheckedChange={(checked) =>
                    handleInputChange("estConfig.disableBootstrapCaValidation", checked)
                  }
                >
                  Disable Bootstrap CA Validation
                </Checkbox>
              </FormControl>

              <FormControl label="EST Passphrase" isRequired>
                <Input
                  type="password"
                  placeholder="Enter EST passphrase"
                  value={formData.estConfig.passphrase}
                  onChange={(e) => handleInputChange("estConfig.passphrase", e.target.value)}
                />
              </FormControl>

              <FormControl label="CA Chain" isRequired>
                <TextArea
                  placeholder="Enter CA chain (PEM format)"
                  value={formData.estConfig.caChain}
                  onChange={(e) => handleInputChange("estConfig.caChain", e.target.value)}
                  rows={6}
                  className="font-mono"
                />
              </FormControl>
            </div>
          )}

          {/* API Configuration */}
          {formData.enrollmentType === "api" && (
            <div className="space-y-4 rounded border border-mineshaft-600 p-4">
              <FormControl>
                <Checkbox
                  id="autoRenew"
                  isChecked={formData.apiConfig.autoRenew}
                  onCheckedChange={(checked) => handleInputChange("apiConfig.autoRenew", checked)}
                >
                  Enable Auto-Renewal
                </Checkbox>
              </FormControl>

              <FormControl label="Auto-Renewal Days">
                <Input
                  type="number"
                  placeholder="30"
                  min="1"
                  max="365"
                  value={formData.apiConfig.autoRenewDays}
                  onChange={(e) =>
                    handleInputChange("apiConfig.autoRenewDays", parseInt(e.target.value, 10) || 30)
                  }
                />
              </FormControl>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faSave} />}
              isLoading={updateProfile.isPending}
              disabled={!formData.name}
            >
              Save Changes
            </Button>
            <Button variant="outline_bg" onClick={onClose} disabled={updateProfile.isPending}>
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
