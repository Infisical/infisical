import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { z } from "zod";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useSubscription
} from "@app/context";
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
  isOcspEnabled: z.boolean(),
  disableManagedCrlDistributionPointUrl: z.boolean(),
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

export const CaRevocationSection = ({ caId }: Props) => {
  const { popUp, handlePopUpToggle } = usePopUp(["editRevocation", "upgradePlan"] as const);
  const { subscription } = useSubscription();

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
      isOcspEnabled: ca?.configuration.isOcspEnabled ?? false,
      disableManagedCrlDistributionPointUrl:
        ca?.configuration.disableManagedCrlDistributionPointUrl ?? false,
      crlDistributionPointUrls: (ca?.configuration.crlDistributionPointUrls ?? []).map((value) => ({
        value
      }))
    }
  });

  const crlUrls = useFieldArray({ control, name: "crlDistributionPointUrls" });

  if (!ca) return null;

  const canUseOcsp = Boolean(subscription.pkiOcsp);
  const isOcspEnabled = ca.configuration.isOcspEnabled ?? false;
  const ocspResponderUrl = `${window.origin}/api/v1/cert-manager/ocsp/${ca.id}`;
  const mirrorUrls = ca.configuration.crlDistributionPointUrls ?? [];

  const handleAddCrlUrl = () => {
    if (!subscription.caCrl) {
      handlePopUpToggle("upgradePlan", true);
      return;
    }
    crlUrls.append({ value: "" });
  };

  const onEditSubmit = async (values: EditFormData) => {
    try {
      await updateCa({
        id: ca.id,
        type: CaType.INTERNAL,
        configuration: {
          isOcspEnabled: values.isOcspEnabled,
          disableManagedCrlDistributionPointUrl: values.disableManagedCrlDistributionPointUrl,
          crlDistributionPointUrls: values.crlDistributionPointUrls.map(({ value }) => value)
        } as TInternalCertificateAuthority["configuration"]
      });
      createNotification({ text: "Revocation settings updated", type: "success" });
      handlePopUpToggle("editRevocation", false);
    } catch {
      handlePopUpToggle("editRevocation", true);
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Revocation</CardTitle>
          <CardDescription>
            How clients check whether certificates issued by this CA are revoked
          </CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionCertificateAuthorityActions.Edit}
              a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
            >
              {(isAllowed) => (
                <IconButton
                  aria-label="Edit revocation"
                  variant="outline"
                  size="xs"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpToggle("editRevocation", true)}
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
              <DetailLabel>OCSP</DetailLabel>
              <DetailValue>{isOcspEnabled ? "Enabled" : "Disabled"}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>OCSP Responder URL</DetailLabel>
              <DetailValue>
                {isOcspEnabled ? (
                  <span className="break-all">{ocspResponderUrl}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Managed CRL URL</DetailLabel>
              <DetailValue>
                {ca.configuration.disableManagedCrlDistributionPointUrl ? "Disabled" : "Enabled"}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>CRL Mirror URLs</DetailLabel>
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

      <Dialog
        open={popUp.editRevocation.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("editRevocation", isOpen);
          if (!isOpen) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Revocation</DialogTitle>
            <DialogDescription>
              Changes apply to certificates issued after you save.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onEditSubmit)} className="flex flex-col gap-4">
            <FieldGroup>
              <Controller
                control={control}
                name="isOcspEnabled"
                render={({ field: { value, onChange } }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>
                        Enable OCSP
                        {!canUseOcsp && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="info">Enterprise</Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              OCSP is available on Infisical&apos;s Enterprise plan.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </FieldLabel>
                      <FieldDescription>
                        Certificates issued by this CA carry an OCSP responder URL, and that
                        responder answers revocation status checks for them.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle
                      variant="project"
                      checked={value}
                      onCheckedChange={onChange}
                      disabled={!canUseOcsp && !isOcspEnabled}
                    />
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="disableManagedCrlDistributionPointUrl"
                render={({ field: { value, onChange } }) => (
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabel>Disable managed CRL URL</FieldLabel>
                      <FieldDescription>
                        When enabled, the Infisical-managed CRL endpoint is not embedded in issued
                        certificates. Only the mirror URLs below are included.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle variant="project" checked={value} onCheckedChange={onChange} />
                  </Field>
                )}
              />

              <Field>
                <FieldLabel>CRL Mirror URLs</FieldLabel>
                <FieldContent>
                  <div className="flex flex-col gap-2">
                    {crlUrls.fields.map((entry, index) => (
                      <Controller
                        key={entry.id}
                        control={control}
                        name={`crlDistributionPointUrls.${index}.value`}
                        render={({ field, fieldState: { error } }) => (
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <Input
                                {...field}
                                placeholder="https://crl.example.com/internal-ca.crl"
                                isError={Boolean(error)}
                              />
                              <FieldError errors={[error]} />
                            </div>
                            <IconButton
                              aria-label="Remove URL"
                              variant="outline"
                              onClick={() => crlUrls.remove(index)}
                            >
                              <Trash2Icon className="h-4 w-4" />
                            </IconButton>
                          </div>
                        )}
                      />
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="self-start"
                      isDisabled={crlUrls.fields.length >= MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS}
                      onClick={handleAddCrlUrl}
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add URL
                    </Button>
                  </div>
                  <FieldDescription>
                    Backup CRL URLs embedded in issued certificates. Up to{" "}
                    {MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS}.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <UpgradePlanModal
        paywallKey="cert-manager.ca-distribution-points"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Custom CRL distribution points are available on Infisical's Enterprise plan."
      />
    </>
  );
};
