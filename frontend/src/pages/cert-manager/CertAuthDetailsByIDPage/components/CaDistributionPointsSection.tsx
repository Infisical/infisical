import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button as ButtonV2,
  FormControl,
  IconButton as IconButtonV2,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton
} from "@app/components/v3";
import { ProjectPermissionCertificateAuthorityActions, ProjectPermissionSub } from "@app/context";
import {
  CaType,
  MAX_DISTRIBUTION_POINT_URL_LENGTH,
  MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS,
  useGetCa,
  useUpdateCa
} from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { usePopUp } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
};

const distributionPointUrlEntrySchema = z.object({
  value: z
    .string()
    .trim()
    .max(MAX_DISTRIBUTION_POINT_URL_LENGTH, "URL is too long")
    .url("Must be a valid URL")
    .refine((url) => /^https?:\/\//i.test(url), { message: "URL must use http:// or https://" })
});

const editSchema = z.object({
  crlDistributionPointUrls: z
    .array(distributionPointUrlEntrySchema)
    .max(
      MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS,
      `Up to ${MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS} URLs are allowed`
    )
    .superRefine((entries, ctx) => {
      const seen = new Set<string>();
      entries.forEach((entry, index) => {
        const normalized = entry.value.trim().replace(/\/+$/, "").toLowerCase();
        if (seen.has(normalized)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "value"],
            message: "Duplicate URL"
          });
        }
        seen.add(normalized);
      });
    })
});

type EditFormData = z.infer<typeof editSchema>;

export const CaDistributionPointsSection = ({ caId }: Props) => {
  const { popUp, handlePopUpToggle } = usePopUp(["editCrlDistributionPoints"] as const);

  const { data } = useGetCa({ caId, type: CaType.INTERNAL });
  const ca = data as TInternalCertificateAuthority | undefined;

  const { mutateAsync: updateCa } = useUpdateCa();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    values: {
      crlDistributionPointUrls: (ca?.configuration.crlDistributionPointUrls ?? []).map((value) => ({
        value
      }))
    }
  });

  const crlUrls = useFieldArray({ control, name: "crlDistributionPointUrls" });

  if (!ca) return null;

  const mirrorUrls = ca.configuration.crlDistributionPointUrls ?? [];

  const onEditSubmit = async ({ crlDistributionPointUrls }: EditFormData) => {
    try {
      await updateCa({
        id: ca.id,
        type: CaType.INTERNAL,
        projectId: ca.projectId,
        configuration: {
          crlDistributionPointUrls: crlDistributionPointUrls.map(({ value }) => value)
        } as TInternalCertificateAuthority["configuration"]
      });
      createNotification({
        text: "CRL distribution points updated",
        type: "success"
      });
      handlePopUpToggle("editCrlDistributionPoints", false);
    } catch {
      createNotification({
        text: "Failed to update CRL distribution points",
        type: "error"
      });
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>CRL Distribution Points</CardTitle>
          <CardDescription>Backup CRL URLs for issued certificates</CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionCertificateAuthorityActions.Edit}
              a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
            >
              {(isAllowed) => (
                <IconButton
                  variant="outline"
                  size="xs"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpToggle("editCrlDistributionPoints", true)}
                >
                  <PencilIcon />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Mirror URLs</DetailLabel>
              <DetailValue>
                {mirrorUrls.length === 0 ? (
                  <span className="text-muted">—</span>
                ) : (
                  <div className="flex flex-col gap-1">
                    {mirrorUrls.map((url) => (
                      <span key={url} className="break-all">
                        {url}
                      </span>
                    ))}
                  </div>
                )}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </CardContent>
      </Card>

      <Modal
        isOpen={popUp.editCrlDistributionPoints.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("editCrlDistributionPoints", isOpen);
          if (!isOpen) reset();
        }}
      >
        <ModalContent title="Edit CRL Distribution Points">
          <form onSubmit={handleSubmit(onEditSubmit)}>
            <FormControl
              label="Mirror URLs"
              helperText={`Up to ${MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS} URLs.`}
            >
              <div className="flex flex-col gap-2">
                {crlUrls.fields.map((field, index) => (
                  <Controller
                    key={field.id}
                    control={control}
                    name={`crlDistributionPointUrls.${index}.value`}
                    render={({ field: inputField, fieldState: { error } }) => (
                      <div className="flex items-start gap-2">
                        <FormControl
                          isError={Boolean(error)}
                          errorText={error?.message}
                          className="mb-0 flex-1"
                        >
                          <Input
                            {...inputField}
                            placeholder="https://crl.example.com/internal-ca.crl"
                          />
                        </FormControl>
                        <Tooltip content="Remove URL" position="right">
                          <IconButtonV2
                            ariaLabel="Remove URL"
                            colorSchema="danger"
                            variant="plain"
                            size="sm"
                            className="mt-1.5"
                            onClick={() => crlUrls.remove(index)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButtonV2>
                        </Tooltip>
                      </div>
                    )}
                  />
                ))}
                <ButtonV2
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  size="xs"
                  variant="outline_bg"
                  isDisabled={crlUrls.fields.length >= MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS}
                  onClick={() => crlUrls.append({ value: "" })}
                >
                  Add URL
                </ButtonV2>
              </div>
            </FormControl>
            <div className="flex w-full justify-between gap-4 pt-4">
              <ModalClose asChild>
                <ButtonV2 colorSchema="secondary" variant="plain">
                  Cancel
                </ButtonV2>
              </ModalClose>
              <ButtonV2
                type="submit"
                colorSchema="secondary"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Save
              </ButtonV2>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};
