import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { Badge, UnstableButtonGroup, UnstableIconButton } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { TPamDomain, useUpdatePamDomain } from "@app/hooks/api/pamDomain";
import { MetadataForm } from "@app/pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/MetadataForm";

type Props = {
  domain: TPamDomain;
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

export const PamDomainMetadataSection = ({ domain }: Props) => {
  const metadata = domain.metadata || [];
  const { mutateAsync: updateDomain } = useUpdatePamDomain();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      try {
        await updateDomain({
          domainId: domain.id,
          domainType: domain.domainType,
          metadata: formData.metadata || []
        });
        createNotification({
          text: "Domain metadata updated successfully",
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
    [domain.id, domain.domainType, updateDomain]
  );

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-container px-4 py-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-lg font-medium">Metadata</h3>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={ProjectPermissionSub.PamDomains}
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
        {metadata.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {metadata.map((item) =>
              item.value ? (
                <UnstableButtonGroup
                  className="max-w-full min-w-0"
                  key={`${item.key}=${item.value}`}
                >
                  <Badge isTruncatable className="max-w-[12rem] shrink-0">
                    <span>{item.key}</span>
                  </Badge>
                  <Badge variant="outline" isTruncatable>
                    <span>{item.value}</span>
                  </Badge>
                </UnstableButtonGroup>
              ) : (
                <Badge key={item.key} isTruncatable>
                  <span>{item.key}</span>
                </Badge>
              )
            )}
          </div>
        ) : (
          <p className="text-sm text-mineshaft-400">No metadata attached to this domain.</p>
        )}
      </div>

      <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent
          title="Edit Metadata"
          subTitle="Update metadata key-value pairs for this domain."
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
