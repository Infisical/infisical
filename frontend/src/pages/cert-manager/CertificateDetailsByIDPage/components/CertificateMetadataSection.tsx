import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, Modal, ModalContent } from "@app/components/v2";
import {
  Badge,
  ButtonGroup,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  IconButton
} from "@app/components/v3";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import { useGetCertificateById, useUpdateCertificate } from "@app/hooks/api";
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
  const { mutateAsync: updateMetadata } = useUpdateCertificate();
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
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-sm text-mineshaft-400">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!certificate) return null;

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Metadata</CardTitle>
          <CardDescription>Custom key-value pairs attached to this certificate</CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionCertificateActions.Edit}
              a={subject(ProjectPermissionSub.Certificates, {
                commonName: certificate.commonName,
                altNames: certificate.altNames?.split(",").map((s) => s.trim()),
                serialNumber: certificate.serialNumber,
                friendlyName: certificate.friendlyName,
                metadata: certificate.metadata
              })}
            >
              {(isAllowed) => (
                <IconButton
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    reset({ metadata: metadata.length > 0 ? metadata : [] });
                    setIsModalOpen(true);
                  }}
                  isDisabled={!isAllowed}
                >
                  <PencilIcon />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {metadata.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {metadata.map((item) =>
                item.value ? (
                  <ButtonGroup className="max-w-full min-w-0" key={`${item.key}=${item.value}`}>
                    <Badge isTruncatable className="max-w-[12rem] shrink-0">
                      <span>{item.key}</span>
                    </Badge>
                    <Badge variant="outline" isTruncatable>
                      <span>{item.value}</span>
                    </Badge>
                  </ButtonGroup>
                ) : (
                  <Badge key={item.key} isTruncatable>
                    <span>{item.key}</span>
                  </Badge>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-mineshaft-400">No metadata attached to this certificate.</p>
          )}
        </CardContent>
      </Card>

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
