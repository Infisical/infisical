import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCheck, faPencil, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { IconButton } from "@app/components/v2";
import {
  Badge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useGetCertificateById, useUpdateCertificateMetadata } from "@app/hooks/api";
import { MetadataForm } from "@app/pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/MetadataForm";

type Props = {
  certificateId: string;
};

type MetadataFormData = {
  metadata: Array<{ key: string; value: string }>;
};

export const CertificateMetadataSection = ({ certificateId }: Props) => {
  const { currentProject } = useProject();
  const { data, isLoading } = useGetCertificateById(certificateId);
  const { mutateAsync: updateMetadata } = useUpdateCertificateMetadata();
  const [isEditing, setIsEditing] = useState(false);

  const certificate = data?.certificate;
  const metadata = certificate?.metadata || [];

  const { control, handleSubmit, reset, formState } = useForm<MetadataFormData>({
    defaultValues: {
      metadata: metadata.length > 0 ? metadata : []
    }
  });

  useEffect(() => {
    if (metadata) {
      reset({ metadata: metadata.length > 0 ? metadata : [] });
    }
  }, [metadata, reset]);

  const handleCancel = useCallback(() => {
    reset({ metadata: metadata.length > 0 ? metadata : [] });
    setIsEditing(false);
  }, [metadata, reset]);

  const onSubmit = useCallback(
    async (formData: MetadataFormData) => {
      if (!currentProject?.id) return;

      try {
        const filteredMetadata = (formData.metadata || []).filter((m) => m.key.trim());
        await updateMetadata({
          certificateId,
          projectId: currentProject.id,
          metadata: filteredMetadata
        });
        createNotification({
          text: "Certificate metadata updated successfully",
          type: "success"
        });
        setIsEditing(false);
      } catch (error) {
        createNotification({
          text: `Failed to update metadata: ${(error as Error)?.message || "Unknown error"}`,
          type: "error"
        });
      }
    },
    [certificateId, currentProject?.id, updateMetadata]
  );

  if (isLoading) {
    return (
      <UnstableCard>
        <UnstableCardContent className="flex items-center justify-center py-8">
          <p className="text-sm text-mineshaft-400">Loading...</p>
        </UnstableCardContent>
      </UnstableCard>
    );
  }

  if (!certificate) return null;

  return (
    <UnstableCard>
      <UnstableCardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <UnstableCardTitle>Metadata</UnstableCardTitle>
            <UnstableCardDescription>
              Custom key-value pairs attached to this certificate
            </UnstableCardDescription>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionCertificateActions.Edit}
            a={subject(ProjectPermissionSub.Certificates, {
              commonName: certificate.commonName,
              altNames: certificate.altNames,
              serialNumber: certificate.serialNumber,
              friendlyName: certificate.friendlyName
            })}
          >
            {(isAllowed) =>
              isAllowed &&
              (isEditing ? (
                <div className="flex gap-2">
                  <IconButton
                    ariaLabel="Save metadata"
                    variant="outline_bg"
                    size="xs"
                    isDisabled={formState.isSubmitting}
                    onClick={handleSubmit(onSubmit)}
                  >
                    <FontAwesomeIcon icon={faCheck} />
                  </IconButton>
                  <IconButton
                    ariaLabel="Cancel editing"
                    variant="outline_bg"
                    size="xs"
                    onClick={handleCancel}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </IconButton>
                </div>
              ) : (
                <IconButton
                  ariaLabel="Edit metadata"
                  variant="outline_bg"
                  size="xs"
                  onClick={() => setIsEditing(true)}
                >
                  <FontAwesomeIcon icon={faPencil} />
                </IconButton>
              ))
            }
          </ProjectPermissionCan>
        </div>
      </UnstableCardHeader>
      <UnstableCardContent>
        {isEditing && <MetadataForm control={control} title="" />}
        {!isEditing && metadata.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {metadata.map((item) => (
              <Badge key={`${item.key}=${item.value}`} variant="neutral">
                {item.key}
                {item.value ? `: ${item.value}` : ""}
              </Badge>
            ))}
          </div>
        )}
        {!isEditing && metadata.length === 0 && (
          <p className="text-sm text-mineshaft-400">No metadata attached to this certificate.</p>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
