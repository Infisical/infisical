import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button as ButtonV2,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import {
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableIconButton
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
import {
  TAvailableAppConnection,
  useListAvailableAppConnections
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  TVenafiApplication,
  TVenafiIssuingTemplate,
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
  [CaSigningConfigType.AZURE_ADCS]: "Azure AD CS"
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

const adcsEditSchema = z.object({
  appConnectionId: z.string().min(1, "App connection is required"),
  template: z.string().min(1, "Certificate template is required"),
  validityPeriod: z.string().optional().or(z.literal(""))
});

type AdcsEditFormData = z.infer<typeof adcsEditSchema>;

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

  const { data: availableAdcsConnections, isPending: isAdcsConnectionsPending } =
    useListAvailableAppConnections(AppConnection.AzureADCS, currentProject.id, {
      enabled: signingConfig?.type === CaSigningConfigType.AZURE_ADCS
    });

  const {
    control: adcsControl,
    handleSubmit: handleAdcsSubmit,
    reset: adcsReset,
    formState: { isSubmitting: isAdcsSubmitting }
  } = useForm<AdcsEditFormData>({
    resolver: zodResolver(adcsEditSchema),
    values: {
      appConnectionId: signingConfig?.appConnectionId ?? "",
      template: (signingConfig?.destinationConfig?.template as string) ?? "",
      validityPeriod: (signingConfig?.destinationConfig?.validityPeriod as string) ?? ""
    }
  });

  if (!ca || ca.status === CaStatus.PENDING_CERTIFICATE || !signingConfig) {
    return null;
  }

  const isVenafi = signingConfig.type === CaSigningConfigType.VENAFI;
  const isAdcs = signingConfig.type === CaSigningConfigType.AZURE_ADCS;

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
      <UnstableCard className="mt-5 w-full">
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Signing Configuration</UnstableCardTitle>
          <UnstableCardDescription>
            How this CA&apos;s certificate is signed
          </UnstableCardDescription>
          {(isVenafi || isAdcs) && ca?.name && (
            <UnstableCardAction>
              <ProjectPermissionCan
                I={ProjectPermissionCertificateAuthorityActions.Edit}
                a={subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })}
              >
                {(isAllowed) => (
                  <UnstableIconButton
                    variant="outline"
                    size="xs"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpToggle("editSigningConfig", true)}
                  >
                    <PencilIcon />
                  </UnstableIconButton>
                )}
              </ProjectPermissionCan>
            </UnstableCardAction>
          )}
        </UnstableCardHeader>
        <UnstableCardContent>
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

            {isAdcs && signingConfig.destinationConfig && (
              <>
                <Detail>
                  <DetailLabel>Certificate Template</DetailLabel>
                  <DetailValue>{signingConfig.destinationConfig.template as string}</DetailValue>
                </Detail>
                {signingConfig.destinationConfig.validityPeriod && (
                  <Detail>
                    <DetailLabel>Validity Period</DetailLabel>
                    <DetailValue>
                      {signingConfig.destinationConfig.validityPeriod as string}
                    </DetailValue>
                  </Detail>
                )}
              </>
            )}
          </DetailGroup>
        </UnstableCardContent>
      </UnstableCard>

      {isAdcs && (
        <Modal
          isOpen={popUp.editSigningConfig.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("editSigningConfig", isOpen);
            if (!isOpen) adcsReset();
          }}
        >
          <ModalContent title="Edit Signing Configuration" bodyClassName="overflow-visible">
            <form
              onSubmit={handleAdcsSubmit(
                async ({ appConnectionId, template, validityPeriod }: AdcsEditFormData) => {
                  try {
                    await updateSigningConfig({
                      caId,
                      appConnectionId,
                      destinationConfig: {
                        template,
                        ...(validityPeriod && { validityPeriod })
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
                control={adcsControl}
                name="appConnectionId"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FormControl
                    label="Azure AD CS Connection"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired
                  >
                    <FilterableSelect
                      isLoading={isAdcsConnectionsPending}
                      value={(availableAdcsConnections || []).find((conn) => conn.id === value)}
                      onChange={(option) => {
                        const selected = option as SingleValue<TAvailableAppConnection>;
                        onChange(selected?.id ?? "");
                      }}
                      options={availableAdcsConnections || []}
                      placeholder="Select an Azure AD CS connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={adcsControl}
                name="template"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Certificate Template"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired
                  >
                    <Input {...field} placeholder="SubCA" />
                  </FormControl>
                )}
              />
              <Controller
                control={adcsControl}
                name="validityPeriod"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Validity Period"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    helperText="Optional TTL (e.g. 365d, 1y)"
                  >
                    <Input {...field} placeholder="365d" />
                  </FormControl>
                )}
              />
              <div className="flex w-full justify-between gap-4 pt-4">
                <ModalClose asChild>
                  <ButtonV2 colorSchema="secondary" variant="plain">
                    Cancel
                  </ButtonV2>
                </ModalClose>
                <ButtonV2
                  isLoading={isAdcsSubmitting}
                  isDisabled={isAdcsSubmitting}
                  type="submit"
                  colorSchema="secondary"
                >
                  Save
                </ButtonV2>
              </div>
            </form>
          </ModalContent>
        </Modal>
      )}

      {isVenafi && (
        <Modal
          isOpen={popUp.editSigningConfig.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("editSigningConfig", isOpen);
            if (!isOpen) reset();
          }}
        >
          <ModalContent title="Edit Signing Configuration" bodyClassName="overflow-visible">
            <form onSubmit={handleSubmit(onEditSubmit)}>
              <Controller
                control={control}
                name="appConnectionId"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FormControl
                    label="Venafi Connection"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired
                  >
                    <FilterableSelect
                      isLoading={isVenafiPending}
                      value={(availableVenafiConnections || []).find((conn) => conn.id === value)}
                      onChange={(option) => {
                        const selected = option as SingleValue<TAvailableAppConnection>;
                        onChange(selected?.id ?? "");
                        setValue("applicationId", "");
                        setValue("issuingTemplateId", "");
                      }}
                      options={availableVenafiConnections || []}
                      placeholder="Select a Venafi connection..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.id}
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="applicationId"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FormControl
                    label="Application"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired
                  >
                    <FilterableSelect
                      isLoading={isApplicationsLoading && !!selectedConnectionId}
                      isDisabled={!selectedConnectionId}
                      value={applications.find((app) => app.id === value)}
                      onChange={(option) => {
                        const selected = option as SingleValue<TVenafiApplication>;
                        onChange(selected?.id ?? "");
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
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="issuingTemplateId"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FormControl
                    label="Issuing Template"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired
                  >
                    <FilterableSelect
                      isLoading={isTemplatesLoading && !!selectedApplicationId}
                      isDisabled={!selectedApplicationId}
                      value={issuingTemplates.find((tmpl) => tmpl.id === value)}
                      onChange={(option) => {
                        const selected = option as SingleValue<TVenafiIssuingTemplate>;
                        onChange(selected?.id ?? "");
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
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="validityPeriod"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Validity Period (Days)"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    helperText="Number of days the certificate should be valid"
                  >
                    <Input {...field} type="number" placeholder="365" />
                  </FormControl>
                )}
              />
              <div className="flex w-full justify-between gap-4 pt-4">
                <ModalClose asChild>
                  <ButtonV2 colorSchema="secondary" variant="plain">
                    Cancel
                  </ButtonV2>
                </ModalClose>
                <ButtonV2
                  isLoading={isSubmitting}
                  isDisabled={isSubmitting}
                  type="submit"
                  colorSchema="secondary"
                >
                  Save
                </ButtonV2>
              </div>
            </form>
          </ModalContent>
        </Modal>
      )}
    </>
  );
};
