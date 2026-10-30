import { useCallback, useEffect, useId, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useGetCertificateById, useUpdateCertificate } from "@app/hooks/api";
import { useGetPkiApplicationPermissions } from "@app/hooks/api/pkiApplications/queries";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";

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
  const fieldId = useId();

  const certificate = data?.certificate;
  const metadata = certificate?.metadata || [];

  const { permission } = useProjectPermission();
  const { data: appPermissionData } = useGetPkiApplicationPermissions(
    certificate?.applicationId ?? ""
  );
  const canEditMetadata =
    (certificate
      ? permission.can(
          ProjectPermissionCertificateActions.Edit,
          subject(ProjectPermissionSub.Certificates, {
            commonName: certificate.commonName,
            altNames: certificate.altNames?.split(",").map((s) => s.trim()),
            serialNumber: certificate.serialNumber,
            friendlyName: certificate.friendlyName,
            metadata: certificate.metadata
          })
        )
      : false) ||
    Boolean(
      appPermissionData?.permission?.can(
        PkiApplicationResourceActions.Edit,
        PkiApplicationResourceSub.Certificates
      )
    );

  const { control, handleSubmit, reset, formState } = useForm<MetadataFormData>({
    resolver: zodResolver(metadataFormSchema),
    defaultValues: {
      metadata: metadata.length > 0 ? metadata : []
    }
  });
  const metadataFields = useFieldArray({ control, name: "metadata" });

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
          <p className="text-sm text-muted">Loading...</p>
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
            <IconButton
              aria-label="Edit certificate metadata"
              variant="outline"
              size="xs"
              onClick={() => {
                reset({ metadata: metadata.length > 0 ? metadata : [] });
                setIsModalOpen(true);
              }}
              isDisabled={!canEditMetadata}
            >
              <PencilIcon />
            </IconButton>
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
            <p className="text-sm text-muted">No metadata attached to this certificate.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent isPending={formState.isSubmitting}>
          <DialogHeader>
            <DialogTitle>Edit Metadata</DialogTitle>
            <DialogDescription>
              Update metadata key-value pairs for this certificate.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-3">
              {metadataFields.fields.length === 0 && (
                <p className="text-sm text-muted">No metadata entries</p>
              )}
              {metadataFields.fields.map(({ id }, index) => (
                <div key={id} className="flex items-start gap-2">
                  <Controller
                    control={control}
                    name={`metadata.${index}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel htmlFor={`${fieldId}-${id}-key`}>Key</FieldLabel>
                        <Input {...field} id={`${fieldId}-${id}-key`} isError={Boolean(error)} />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`metadata.${index}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel htmlFor={`${fieldId}-${id}-value`}>
                          Value <span className="font-normal text-muted">- Optional</span>
                        </FieldLabel>
                        <Input {...field} id={`${fieldId}-${id}-value`} isError={Boolean(error)} />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <IconButton
                    aria-label="Remove metadata entry"
                    variant="ghost"
                    className="mt-6"
                    onClick={() => metadataFields.remove(index)}
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => metadataFields.append({ key: "", value: "" })}
              >
                <PlusIcon />
                Add Entry
              </Button>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost" onClick={handleCancel}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="project" isPending={formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
