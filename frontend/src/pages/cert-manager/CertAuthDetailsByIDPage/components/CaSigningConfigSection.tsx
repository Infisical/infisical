import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { useConnectionCreation } from "@app/components/app-connections/useConnectionCreation";
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
  Combobox,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useProject
} from "@app/context";
import {
  CaSigningConfigType,
  CaStatus,
  CaType,
  useGetCa,
  useGetCaSigningConfig,
  useUpdateCaSigningConfig
} from "@app/hooks/api";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections";
import { useAdcsConnectionListCertificateTemplates } from "@app/hooks/api/appConnections/adcs";
import { useAzureAdcsConnectionListTemplates } from "@app/hooks/api/appConnections/azure-adcs";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  useVenafiConnectionListApplications,
  useVenafiConnectionListIssuingTemplates
} from "@app/hooks/api/appConnections/venafi";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { usePopUp } from "@app/hooks/usePopUp";

type Props = {
  caId: string;
};

const signingTypeLabels: Record<CaSigningConfigType, string> = {
  [CaSigningConfigType.INTERNAL]: "Internal (Infisical CA)",
  [CaSigningConfigType.MANUAL]: "Manual",
  [CaSigningConfigType.VENAFI]: "Venafi TLS Protect Cloud",
  [CaSigningConfigType.AZURE_ADCS]: "Azure AD CS (Web Enrollment)",
  [CaSigningConfigType.ADCS]: "ADCS"
};

const getSigningTypeBadgeVariant = (type: CaSigningConfigType) => {
  if (type === CaSigningConfigType.INTERNAL) return "info";
  return "neutral";
};

const editSchema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  applicationId: z.string().min(1, "Application is required"),
  issuingTemplateId: z.string().min(1, "Issuing Template is required"),
  validityPeriod: z.coerce
    .number()
    .int()
    .min(1, "Must be at least 1 day")
    .optional()
    .or(z.literal(""))
});

type EditFormData = z.infer<typeof editSchema>;

const azureAdcsEditSchema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  template: z.string().min(1, "Certificate template is required"),
  validityPeriod: z.coerce
    .number()
    .int()
    .min(1, "Must be at least 1 day")
    .optional()
    .or(z.literal(""))
});

type AzureAdcsEditFormData = z.infer<typeof azureAdcsEditSchema>;

// Native ADCS derives validity from the CA template, so there is no validity period field.
const nativeAdcsEditSchema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  template: z.string().min(1, "Certificate template is required")
});

type NativeAdcsEditFormData = z.infer<typeof nativeAdcsEditSchema>;

export const CaSigningConfigSection = ({ caId }: Props) => {
  const { currentProject } = useProject();
  const { popUp, handlePopUpToggle } = usePopUp(["editSigningConfig"] as const);

  const { data: caData } = useGetCa({
    caId,
    type: CaType.INTERNAL
  });

  const ca = caData as TInternalCertificateAuthority;

  const { data: signingConfig } = useGetCaSigningConfig(caId, {
    enabled: Boolean(caId) && ca?.status !== CaStatus.PENDING_CERTIFICATE
  });

  const { mutateAsync: updateSigningConfig } = useUpdateCaSigningConfig();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    values: {
      appConnectionId: signingConfig?.appConnectionId ?? "",
      applicationId: (signingConfig?.destinationConfig?.applicationId as string) ?? "",
      issuingTemplateId: (signingConfig?.destinationConfig?.issuingTemplateId as string) ?? "",
      validityPeriod: (signingConfig?.destinationConfig?.validityPeriod as number | undefined) ?? ""
    }
  });

  const selectedConnectionId = watch("appConnectionId");
  const selectedApplicationId = watch("applicationId");

  const { data: availableVenafiConnections, isPending: isVenafiPending } =
    useListAvailableAppConnections(AppConnection.Venafi, currentProject.id, {
      enabled: signingConfig?.type === CaSigningConfigType.VENAFI
    });

  const { data: applications = [], isPending: isApplicationsLoading } =
    useVenafiConnectionListApplications(selectedConnectionId ?? "", {
      enabled: !!selectedConnectionId && popUp.editSigningConfig.isOpen
    });

  const { data: issuingTemplates = [], isPending: isTemplatesLoading } =
    useVenafiConnectionListIssuingTemplates(
      selectedConnectionId ?? "",
      selectedApplicationId ?? "",
      {
        enabled: !!selectedConnectionId && !!selectedApplicationId && popUp.editSigningConfig.isOpen
      }
    );

  const { data: availableAzureAdcsConnections, isPending: isAzureAdcsConnectionsPending } =
    useListAvailableAppConnections(AppConnection.AzureADCS, currentProject.id, {
      enabled: signingConfig?.type === CaSigningConfigType.AZURE_ADCS
    });

  const {
    control: azureAdcsControl,
    handleSubmit: handleAzureAdcsSubmit,
    reset: azureAdcsReset,
    setValue: azureAdcsSetValue,
    watch: azureAdcsWatch,
    formState: { isSubmitting: isAzureAdcsSubmitting }
  } = useForm<AzureAdcsEditFormData>({
    resolver: zodResolver(azureAdcsEditSchema),
    values: {
      appConnectionId: signingConfig?.appConnectionId ?? "",
      template: (signingConfig?.destinationConfig?.template as string) ?? "",
      validityPeriod: (signingConfig?.destinationConfig?.validityPeriod as number | undefined) ?? ""
    }
  });

  const selectedAzureAdcsConnectionId = azureAdcsWatch("appConnectionId");

  const { data: azureAdcsTemplates = [], isPending: isAzureAdcsTemplatesLoading } =
    useAzureAdcsConnectionListTemplates(selectedAzureAdcsConnectionId ?? "", {
      enabled: !!selectedAzureAdcsConnectionId && popUp.editSigningConfig.isOpen
    });

  const { data: availableNativeAdcsConnections, isPending: isNativeAdcsConnectionsPending } =
    useListAvailableAppConnections(AppConnection.ADCS, currentProject.id, {
      enabled: signingConfig?.type === CaSigningConfigType.ADCS
    });

  const {
    control: nativeAdcsControl,
    handleSubmit: handleNativeAdcsSubmit,
    reset: nativeAdcsReset,
    setValue: nativeAdcsSetValue,
    watch: nativeAdcsWatch,
    formState: { isSubmitting: isNativeAdcsSubmitting }
  } = useForm<NativeAdcsEditFormData>({
    resolver: zodResolver(nativeAdcsEditSchema),
    values: {
      appConnectionId: signingConfig?.appConnectionId ?? "",
      template: (signingConfig?.destinationConfig?.template as string) ?? ""
    }
  });

  const selectedNativeAdcsConnectionId = nativeAdcsWatch("appConnectionId");

  const { data: nativeAdcsTemplates = [], isPending: isNativeAdcsTemplatesLoading } =
    useAdcsConnectionListCertificateTemplates(selectedNativeAdcsConnectionId ?? "", {
      enabled: !!selectedNativeAdcsConnectionId && popUp.editSigningConfig.isOpen
    });

  const venafiConnectionCreation = useConnectionCreation(AppConnection.Venafi, (connection) => {
    setValue("appConnectionId", connection.id, { shouldDirty: true });
    setValue("applicationId", "");
    setValue("issuingTemplateId", "");
  });
  const azureAdcsConnectionCreation = useConnectionCreation(
    AppConnection.AzureADCS,
    (connection) => {
      azureAdcsSetValue("appConnectionId", connection.id, { shouldDirty: true });
      azureAdcsSetValue("template", "", { shouldDirty: true });
    }
  );
  const nativeAdcsConnectionCreation = useConnectionCreation(AppConnection.ADCS, (connection) => {
    nativeAdcsSetValue("appConnectionId", connection.id, { shouldDirty: true });
    nativeAdcsSetValue("template", "", { shouldDirty: true });
  });

  if (!ca || ca.status === CaStatus.PENDING_CERTIFICATE || !signingConfig) {
    return null;
  }

  const isVenafi = signingConfig.type === CaSigningConfigType.VENAFI;
  const isAzureAdcs = signingConfig.type === CaSigningConfigType.AZURE_ADCS;
  const isNativeAdcs = signingConfig.type === CaSigningConfigType.ADCS;

  const onEditSubmit = async ({
    appConnectionId,
    applicationId,
    issuingTemplateId,
    validityPeriod
  }: EditFormData) => {
    try {
      await updateSigningConfig({
        caId,
        appConnectionId,
        destinationConfig: {
          applicationId,
          issuingTemplateId,
          ...(typeof validityPeriod === "number" && { validityPeriod })
        }
      });
      createNotification({
        text: "Signing configuration updated",
        type: "success"
      });
      handlePopUpToggle("editSigningConfig", false);
    } catch {
      createNotification({
        text: "Failed to update signing configuration",
        type: "error"
      });
    }
  };

  return (
    <>
      <Card className="mt-5 w-full">
        <CardHeader className="border-b">
          <CardTitle>Signing Configuration</CardTitle>
          <CardDescription>How this CA&apos;s certificate is signed</CardDescription>
          {(isVenafi || isAzureAdcs || isNativeAdcs) && ca?.name && (
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
                    onClick={() => handlePopUpToggle("editSigningConfig", true)}
                  >
                    <PencilIcon />
                  </IconButton>
                )}
              </ProjectPermissionCan>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Signing Method</DetailLabel>
              <DetailValue>
                <Badge variant={getSigningTypeBadgeVariant(signingConfig.type)}>
                  {signingTypeLabels[signingConfig.type] || signingConfig.type}
                </Badge>
              </DetailValue>
            </Detail>

            {isVenafi && signingConfig.destinationConfig && (
              <>
                <Detail>
                  <DetailLabel>Application ID</DetailLabel>
                  <DetailValue>
                    {signingConfig.destinationConfig.applicationId as string}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Issuing Template ID</DetailLabel>
                  <DetailValue>
                    {signingConfig.destinationConfig.issuingTemplateId as string}
                  </DetailValue>
                </Detail>
                {signingConfig.destinationConfig.validityPeriod && (
                  <Detail>
                    <DetailLabel>Validity Period</DetailLabel>
                    <DetailValue>
                      {signingConfig.destinationConfig.validityPeriod as number} days
                    </DetailValue>
                  </Detail>
                )}
              </>
            )}

            {isAzureAdcs && signingConfig.destinationConfig && (
              <>
                <Detail>
                  <DetailLabel>Certificate Template</DetailLabel>
                  <DetailValue>{signingConfig.destinationConfig.template as string}</DetailValue>
                </Detail>
                {signingConfig.destinationConfig.validityPeriod && (
                  <Detail>
                    <DetailLabel>Validity Period</DetailLabel>
                    <DetailValue>
                      {signingConfig.destinationConfig.validityPeriod as number} days
                    </DetailValue>
                  </Detail>
                )}
              </>
            )}

            {isNativeAdcs && signingConfig.destinationConfig && (
              <Detail>
                <DetailLabel>Certificate Template</DetailLabel>
                <DetailValue>{signingConfig.destinationConfig.template as string}</DetailValue>
              </Detail>
            )}
          </DetailGroup>
        </CardContent>
      </Card>

      {isAzureAdcs && (
        <Sheet
          open={popUp.editSigningConfig.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("editSigningConfig", isOpen);
            if (!isOpen) azureAdcsReset();
          }}
        >
          <SheetContent size="form" isPending={isAzureAdcsSubmitting}>
            <SheetHeader>
              <SheetTitle>Edit Signing Configuration</SheetTitle>
            </SheetHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={handleAzureAdcsSubmit(
                async ({ appConnectionId, template, validityPeriod }: AzureAdcsEditFormData) => {
                  try {
                    await updateSigningConfig({
                      caId,
                      appConnectionId,
                      destinationConfig: {
                        template,
                        ...(typeof validityPeriod === "number" && { validityPeriod })
                      }
                    });
                    createNotification({
                      text: "Signing configuration updated",
                      type: "success"
                    });
                    handlePopUpToggle("editSigningConfig", false);
                  } catch {
                    createNotification({
                      text: "Failed to update signing configuration",
                      type: "error"
                    });
                  }
                }
              )}
            >
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                <Controller
                  control={azureAdcsControl}
                  name="appConnectionId"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="signing-config-azure-ad-cs-connection">
                        Azure AD CS Connection <span className="text-danger">*</span>
                      </FieldLabel>
                      <Combobox
                        isError={Boolean(error)}
                        isClearable={false}
                        id="signing-config-azure-ad-cs-connection"
                        creation={azureAdcsConnectionCreation}
                        isLoading={isAzureAdcsConnectionsPending}
                        value={(availableAzureAdcsConnections || []).find(
                          (conn) => conn.id === value
                        )}
                        onValueChange={(selected) => {
                          onChange(selected.id);
                          azureAdcsSetValue("template", "", { shouldDirty: true });
                        }}
                        options={availableAzureAdcsConnections || []}
                        placeholder="Select an Azure AD CS connection..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={azureAdcsControl}
                  name="template"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="signing-config-certificate-template">
                        Certificate Template <span className="text-danger">*</span>
                      </FieldLabel>
                      <Combobox
                        isError={Boolean(error)}
                        isClearable={false}
                        id="signing-config-certificate-template"
                        isLoading={isAzureAdcsTemplatesLoading && !!selectedAzureAdcsConnectionId}
                        isDisabled={!selectedAzureAdcsConnectionId}
                        value={
                          azureAdcsTemplates.find((t) => t === value)
                            ? { label: value, value }
                            : null
                        }
                        onValueChange={(selected) => {
                          onChange(selected.value);
                        }}
                        options={azureAdcsTemplates.map((t) => ({ label: t, value: t }))}
                        placeholder={
                          selectedAzureAdcsConnectionId
                            ? "Select a template..."
                            : "Select a connection first"
                        }
                        getOptionLabel={(option) => option.label}
                        getOptionValue={(option) => option.value}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={azureAdcsControl}
                  name="validityPeriod"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="signing-config-validity-period-days">
                        Validity Period (Days)
                      </FieldLabel>
                      <Input
                        id="signing-config-validity-period-days"
                        isError={Boolean(error)}
                        {...field}
                        type="number"
                        placeholder="365"
                      />
                      <FieldDescription>
                        Number of days the certificate should be valid
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </SheetClose>
                <Button type="submit" variant="project" isPending={isAzureAdcsSubmitting}>
                  Save
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      )}

      {isNativeAdcs && (
        <Dialog
          open={popUp.editSigningConfig.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("editSigningConfig", isOpen);
            if (!isOpen) nativeAdcsReset();
          }}
        >
          <DialogContent isPending={isNativeAdcsSubmitting}>
            <DialogHeader>
              <DialogTitle>Edit Signing Configuration</DialogTitle>
            </DialogHeader>
            <form
              className="flex flex-col gap-6"
              onSubmit={handleNativeAdcsSubmit(
                async ({ appConnectionId, template }: NativeAdcsEditFormData) => {
                  try {
                    await updateSigningConfig({
                      caId,
                      appConnectionId,
                      destinationConfig: {
                        template
                      }
                    });
                    createNotification({
                      text: "Signing configuration updated",
                      type: "success"
                    });
                    handlePopUpToggle("editSigningConfig", false);
                  } catch {
                    createNotification({
                      text: "Failed to update signing configuration",
                      type: "error"
                    });
                  }
                }
              )}
            >
              <Controller
                control={nativeAdcsControl}
                name="appConnectionId"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="signing-config-adcs-connection">
                      ADCS Connection <span className="text-danger">*</span>
                    </FieldLabel>
                    <Combobox
                      isError={Boolean(error)}
                      isClearable={false}
                      id="signing-config-adcs-connection"
                      creation={nativeAdcsConnectionCreation}
                      isLoading={isNativeAdcsConnectionsPending}
                      value={(availableNativeAdcsConnections || []).find(
                        (conn) => conn.id === value
                      )}
                      onValueChange={(selected) => {
                        onChange(selected.id);
                        nativeAdcsSetValue("template", "", { shouldDirty: true });
                      }}
                      options={availableNativeAdcsConnections || []}
                      placeholder="Select an ADCS connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={nativeAdcsControl}
                name="template"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="signing-config-certificate-template-2">
                      Certificate Template <span className="text-danger">*</span>
                    </FieldLabel>
                    <Combobox
                      isError={Boolean(error)}
                      isClearable={false}
                      id="signing-config-certificate-template-2"
                      isLoading={isNativeAdcsTemplatesLoading && !!selectedNativeAdcsConnectionId}
                      isDisabled={!selectedNativeAdcsConnectionId}
                      value={
                        nativeAdcsTemplates.find((t) => t.name === value)
                          ? { label: value, value }
                          : null
                      }
                      onValueChange={(selected) => {
                        onChange(selected.value);
                      }}
                      options={nativeAdcsTemplates.map((t) => ({ label: t.name, value: t.name }))}
                      placeholder={
                        selectedNativeAdcsConnectionId
                          ? "Select a template..."
                          : "Select a connection first"
                      }
                      getOptionLabel={(option) => option.label}
                      getOptionValue={(option) => option.value}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button type="submit" variant="project" isPending={isNativeAdcsSubmitting}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {isVenafi && (
        <Sheet
          open={popUp.editSigningConfig.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("editSigningConfig", isOpen);
            if (!isOpen) reset();
          }}
        >
          <SheetContent size="form" isPending={isSubmitting}>
            <SheetHeader>
              <SheetTitle>Edit Signing Configuration</SheetTitle>
            </SheetHeader>
            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onEditSubmit)}>
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                <Controller
                  control={control}
                  name="appConnectionId"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="signing-config-venafi-connection">
                        Venafi Connection <span className="text-danger">*</span>
                      </FieldLabel>
                      <Combobox
                        isError={Boolean(error)}
                        isClearable={false}
                        id="signing-config-venafi-connection"
                        creation={venafiConnectionCreation}
                        isLoading={isVenafiPending}
                        value={
                          (availableVenafiConnections || []).find((conn) => conn.id === value) ??
                          null
                        }
                        onValueChange={(selected) => {
                          onChange(selected.id);
                          setValue("applicationId", "");
                          setValue("issuingTemplateId", "");
                        }}
                        options={availableVenafiConnections || []}
                        placeholder="Select a Venafi connection..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="applicationId"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="signing-config-application">
                        Application <span className="text-danger">*</span>
                      </FieldLabel>
                      <Combobox
                        isError={Boolean(error)}
                        isClearable={false}
                        id="signing-config-application"
                        isLoading={isApplicationsLoading && !!selectedConnectionId}
                        isDisabled={!selectedConnectionId}
                        value={applications.find((app) => app.id === value) ?? null}
                        onValueChange={(selected) => {
                          onChange(selected.id);
                          setValue("issuingTemplateId", "");
                        }}
                        options={applications}
                        placeholder={
                          selectedConnectionId
                            ? "Select an application..."
                            : "Select a connection first"
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="issuingTemplateId"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="signing-config-issuing-template">
                        Issuing Template <span className="text-danger">*</span>
                      </FieldLabel>
                      <Combobox
                        isError={Boolean(error)}
                        isClearable={false}
                        id="signing-config-issuing-template"
                        isLoading={isTemplatesLoading && !!selectedApplicationId}
                        isDisabled={!selectedApplicationId}
                        value={issuingTemplates.find((tmpl) => tmpl.id === value) ?? null}
                        onValueChange={(selected) => {
                          onChange(selected.id);
                        }}
                        options={issuingTemplates}
                        placeholder={
                          selectedApplicationId
                            ? "Select an issuing template..."
                            : "Select an application first"
                        }
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.id}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="validityPeriod"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="signing-config-validity-period-days-2">
                        Validity Period (Days)
                      </FieldLabel>
                      <Input
                        id="signing-config-validity-period-days-2"
                        isError={Boolean(error)}
                        {...field}
                        type="number"
                        placeholder="365"
                      />
                      <FieldDescription>
                        Number of days the certificate should be valid
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </SheetClose>
                <Button type="submit" variant="project" isPending={isSubmitting}>
                  Save
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
};
