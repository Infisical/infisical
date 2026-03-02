import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { subject } from "@casl/ability";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, Modal, ModalContent } from "@app/components/v2";
import {
  Badge,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
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

const metadataFormSchema = z.object({
  metadata: z
    .object({
      key: z.string().trim().min(1, "Key is required"),
      value: z.string().trim().default("")
    })
    .array()
});

type MetadataFormData = z.infer<typeof metadataFormSchema>;

export const CertificateMetadataSection = ({ certificateId }: Props) => {
  const { currentProject } = useProject();
  const { data, isLoading } = useGetCertificateById(certificateId);
  const { mutateAsync: updateMetadata } = useUpdateCertificateMetadata();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const certificate = data?.certificate;
  const metadata = certificate?.metadata || [];

  const { control, handleSubmit, reset, formState } = useForm<MetadataFormData>({
    resolver: zodResolver(metadataFormSchema),
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
    setIsModalOpen(false);
  }, [metadata, reset]);

  const onSubmit = useCallback(
    async (formData: MetadataFormData) => {
      if (!currentProject?.id) return;

      try {
        await updateMetadata({
          certificateId,
          projectId: currentProject.id,
          metadata: formData.metadata || []
        });
        createNotification({
          text: "Certificate metadata updated successfully",
          type: "success"
        });
        setIsModalOpen(false);
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
    <>
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
              {(isAllowed) => (
                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    reset({ metadata: metadata.length > 0 ? metadata : [] });
                    setIsModalOpen(true);
                  }}
                  isDisabled={!isAllowed}
                >
                  <PencilIcon />
                </UnstableIconButton>
              )}
            </ProjectPermissionCan>
          </div>
        </UnstableCardHeader>
        <UnstableCardContent>
          {metadata.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {metadata.map((item) => (
                <Badge key={`${item.key}=${item.value}`} variant="neutral">
                  {item.key}
                  {item.value ? `: ${item.value}` : ""}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-mineshaft-400">No metadata attached to this certificate.</p>
          )}
        </UnstableCardContent>
      </UnstableCard>

      <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent
          title="Edit Metadata"
          subTitle="Update metadata key-value pairs for this certificate."
        >
          <MetadataForm control={control} title="" />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline_bg" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit(onSubmit)}
              isLoading={formState.isSubmitting}
              isDisabled={formState.isSubmitting}
            >
              Save
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
