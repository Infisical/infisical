import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Checkbox,
  Combobox,
  DiscardChangesAlertDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  CaType,
  useCreatePkiSubscriber,
  useGetAzureAdcsTemplates,
  useGetPkiSubscriber,
  useListCasByProjectId,
  useListWorkspacePkiSubscribers,
  useUpdatePkiSubscriber
} from "@app/hooks/api";
import {
  buildExtendedKeyUsageToggleSchema,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { convertTimeUnitValueToDays, TimeUnit } from "@app/lib/fn/date";
import { useCaCreation } from "@app/pages/cert-manager/components/useCaCreation";

type Props = {
  popUp: UsePopUpState<["pkiSubscriber"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["pkiSubscriber"]>, state?: boolean) => void;
};

enum FormTab {
  Configuration = "configuration",
  Advanced = "advanced"
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    caId: z.string().min(1, "Issuing CA is required"),
    commonName: z.string().trim().min(1, "Common Name is required"),
    subjectAlternativeNames: z.string(),
    ttl: z.string().trim().optional(),
    keyUsages: z.object({
      [CertKeyUsage.DIGITAL_SIGNATURE]: z.boolean().optional(),
      [CertKeyUsage.KEY_ENCIPHERMENT]: z.boolean().optional(),
      [CertKeyUsage.NON_REPUDIATION]: z.boolean().optional(),
      [CertKeyUsage.DATA_ENCIPHERMENT]: z.boolean().optional(),
      [CertKeyUsage.KEY_AGREEMENT]: z.boolean().optional(),
      [CertKeyUsage.KEY_CERT_SIGN]: z.boolean().optional(),
      [CertKeyUsage.CRL_SIGN]: z.boolean().optional(),
      [CertKeyUsage.ENCIPHER_ONLY]: z.boolean().optional(),
      [CertKeyUsage.DECIPHER_ONLY]: z.boolean().optional()
    }),
    extendedKeyUsages: z.object({
      ...buildExtendedKeyUsageToggleSchema(z.boolean().optional())
    }),
    enableAutoRenewal: z.boolean().optional().default(false),
    renewalBefore: z.coerce.number().min(1).optional(),
    renewalUnit: z.nativeEnum(TimeUnit).optional(),
    // Properties for Azure ADCS only
    azureTemplateType: z.string().optional(),
    organization: z
      .string()
      .trim()
      .max(64, "Organization cannot exceed 64 characters")
      .regex(
        /^[^,=+<>#;\\"/\r\n\t]*$/,
        'Organization contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
      )
      .regex(
        /^[^\s\-_.]+.*[^\s\-_.]+$|^[^\s\-_.]{1}$/,
        "Organization cannot start or end with spaces, hyphens, underscores, or periods"
      )
      .optional()
      .or(z.literal("")),
    organizationalUnit: z
      .string()
      .trim()
      .max(64, "Organizational Unit cannot exceed 64 characters")
      .regex(
        /^[^,=+<>#;\\"/\r\n\t]*$/,
        'Organizational Unit contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
      )
      .regex(
        /^[^\s\-_.]+.*[^\s\-_.]+$|^[^\s\-_.]{1}$/,
        "Organizational Unit cannot start or end with spaces, hyphens, underscores, or periods"
      )
      .optional()
      .or(z.literal("")),
    country: z
      .string()
      .trim()
      .length(2, "Country must be exactly 2 characters")
      .regex(/^[A-Z]{2}$/, "Country must be exactly 2 uppercase letters")
      .optional()
      .or(z.literal("")),
    state: z
      .string()
      .trim()
      .max(64, "State cannot exceed 64 characters")
      .regex(
        /^[^,=+<>#;\\"/\r\n\t]*$/,
        'State contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
      )
      .regex(
        /^[^\s\-_.]+.*[^\s\-_.]+$|^[^\s\-_.]{1}$/,
        "State cannot start or end with spaces, hyphens, underscores, or periods"
      )
      .optional()
      .or(z.literal("")),
    locality: z
      .string()
      .trim()
      .max(64, "Locality cannot exceed 64 characters")
      .regex(
        /^[^,=+<>#;\\"/\r\n\t]*$/,
        'Locality contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t'
      )
      .regex(
        /^[^\s\-_.]+.*[^\s\-_.]+$|^[^\s\-_.]{1}$/,
        "Locality cannot start or end with spaces, hyphens, underscores, or periods"
      )
      .optional()
      .or(z.literal("")),
    emailAddress: z
      .string()
      .trim()
      .email("Email Address must be a valid email format")
      .min(6, "Email Address must be at least 6 characters")
      .max(64, "Email Address cannot exceed 64 characters")
      .optional()
      .or(z.literal(""))
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const PkiSubscriberModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const formId = useId();
  const projectId = currentProject.id;
  const { data: subscribers } = useListWorkspacePkiSubscribers(projectId);
  const { data: cas } = useListCasByProjectId();
  const [tabValue, setTabValue] = useState<FormTab>(FormTab.Configuration);

  const subscriberName =
    (popUp?.pkiSubscriber?.data as { subscriberName?: string })?.subscriberName || "";
  const { data: pkiSubscriber } = useGetPkiSubscriber({
    subscriberName,
    projectId
  });
  const isSubscriberReady = !subscriberName || pkiSubscriber?.name === subscriberName;

  const { mutateAsync: createMutateAsync } = useCreatePkiSubscriber();
  const { mutateAsync: updateMutateAsync } = useUpdatePkiSubscriber();

  const {
    control,
    handleSubmit,
    reset,
    resetField,
    getValues,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      caId: "",
      commonName: "",
      subjectAlternativeNames: "",
      ttl: "",
      keyUsages: {
        [CertKeyUsage.DIGITAL_SIGNATURE]: true,
        [CertKeyUsage.KEY_ENCIPHERMENT]: true
      },
      extendedKeyUsages: {},
      enableAutoRenewal: false,
      renewalBefore: 7,
      renewalUnit: TimeUnit.DAY,
      azureTemplateType: "",
      organization: "",
      organizationalUnit: "",
      country: "",
      state: "",
      locality: "",
      emailAddress: ""
    }
  });

  const selectedCaId = watch("caId");
  const { creation: caCreation, caCreationModals } = useCaCreation<NonNullable<typeof cas>[number]>(
    (ca) => {
      setValue("caId", ca.id, { shouldDirty: true, shouldValidate: true });
    }
  );
  const selectedCa = cas?.find((ca) => ca.id === selectedCaId);
  const selectedAutoRenewalState = watch("enableAutoRenewal");

  // Fetch Azure ADCS templates when Azure CA is selected
  const { data: azureTemplates } = useGetAzureAdcsTemplates({
    caId: selectedCa?.type === CaType.AZURE_AD_CS ? selectedCaId : "",
    isAzureAdcsCa: true
  });

  useEffect(() => {
    if (pkiSubscriber && popUp.pkiSubscriber.isOpen && isSubscriberReady) {
      reset({
        name: pkiSubscriber.name,
        caId: pkiSubscriber.caId || "",
        commonName: pkiSubscriber.commonName,
        subjectAlternativeNames: pkiSubscriber.subjectAlternativeNames.join(", "),
        ttl: pkiSubscriber.ttl || "",
        keyUsages: Object.fromEntries((pkiSubscriber.keyUsages || []).map((name) => [name, true])),
        extendedKeyUsages: Object.fromEntries(
          (pkiSubscriber.extendedKeyUsages || []).map((name) => [name, true])
        ),
        enableAutoRenewal: pkiSubscriber.enableAutoRenewal || false,
        renewalBefore: pkiSubscriber.autoRenewalPeriodInDays || 7,
        renewalUnit: TimeUnit.DAY,
        azureTemplateType: pkiSubscriber.properties?.azureTemplateType || "",
        organization: pkiSubscriber.properties?.organization || "",
        organizationalUnit: pkiSubscriber.properties?.organizationalUnit || "",
        country: pkiSubscriber.properties?.country || "",
        state: pkiSubscriber.properties?.state || "",
        locality: pkiSubscriber.properties?.locality || "",
        emailAddress: pkiSubscriber.properties?.emailAddress || ""
      });
    }
  }, [pkiSubscriber, popUp.pkiSubscriber.isOpen, reset, isSubscriberReady]);

  useEffect(() => {
    if (cas?.length && !subscriberName && popUp.pkiSubscriber.isOpen && !getValues("caId")) {
      resetField("caId", { defaultValue: cas[0].id });
    }
  }, [cas, subscriberName, popUp.pkiSubscriber.isOpen]);

  const onFormSubmit = async ({
    name,
    caId,
    commonName,
    subjectAlternativeNames,
    ttl,
    keyUsages,
    extendedKeyUsages,
    enableAutoRenewal,
    renewalBefore,
    renewalUnit,
    azureTemplateType,
    organization,
    organizationalUnit,
    country,
    state,
    locality,
    emailAddress
  }: FormData) => {
    if (!projectId || !isSubscriberReady) return;

    if (!caId) {
      createNotification({
        text: "Please select an Issuing CA",
        type: "error"
      });
      return;
    }

    // Check if there is already a different subscriber with the same name
    const existingNames =
      subscribers?.filter((s) => s.id !== pkiSubscriber?.id).map((s) => s.name) || [];

    if (existingNames.includes(name.trim())) {
      createNotification({
        text: "A subscriber with this name already exists.",
        type: "error"
      });
      return;
    }

    // Validate Azure template for Azure ADCS CA
    if (selectedCa?.type === CaType.AZURE_AD_CS && !azureTemplateType) {
      createNotification({
        text: "Please select an Azure certificate template",
        type: "error"
      });
      return;
    }

    const keyUsagesList =
      selectedCa?.type === CaType.AZURE_AD_CS
        ? []
        : Object.entries(keyUsages)
            .filter(([, value]) => value)
            .map(([key]) => key as CertKeyUsage);

    const extendedKeyUsagesList =
      selectedCa?.type === CaType.AZURE_AD_CS
        ? []
        : Object.entries(extendedKeyUsages)
            .filter(([, value]) => value)
            .map(([key]) => key as CertExtendedKeyUsage);

    const subjectAlternativeNamesList = subjectAlternativeNames
      .split(",")
      .map((san) => san.trim())
      .filter(Boolean);

    const autoRenewalPeriodInDays = enableAutoRenewal
      ? convertTimeUnitValueToDays(renewalUnit, renewalBefore)
      : undefined;

    // Build properties object
    const properties = {
      ...(selectedCa?.type === CaType.AZURE_AD_CS && azureTemplateType && { azureTemplateType }),
      ...(organization && { organization }),
      ...(organizationalUnit && { organizationalUnit }),
      ...(country && { country }),
      ...(state && { state }),
      ...(locality && { locality }),
      ...(emailAddress && { emailAddress })
    };

    if (pkiSubscriber) {
      await updateMutateAsync({
        subscriberName: pkiSubscriber.name,
        name,
        caId,
        commonName,
        subjectAlternativeNames: subjectAlternativeNamesList,
        ttl,
        keyUsages: keyUsagesList.map((key) =>
          key === CertKeyUsage.CRL_SIGN
            ? "cRLSign"
            : key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        ),
        extendedKeyUsages: extendedKeyUsagesList.map((key) =>
          key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        ),
        enableAutoRenewal,
        autoRenewalPeriodInDays,
        properties: Object.keys(properties).length > 0 ? properties : undefined
      });
    } else {
      await createMutateAsync({
        name,
        caId,
        commonName,
        subjectAlternativeNames: subjectAlternativeNamesList,
        ttl,
        keyUsages: keyUsagesList.map((key) =>
          key === CertKeyUsage.CRL_SIGN
            ? "cRLSign"
            : key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        ),
        extendedKeyUsages: extendedKeyUsagesList.map((key) =>
          key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        ),
        enableAutoRenewal,
        autoRenewalPeriodInDays,
        properties: Object.keys(properties).length > 0 ? properties : undefined
      });
    }

    reset();
    handlePopUpToggle("pkiSubscriber", false);

    createNotification({
      text: `Successfully ${pkiSubscriber ? "updated" : "added"} PKI subscriber`,
      type: "success"
    });
  };

  const { requestDiscard, confirmDiscard, isDiscardDialogOpen, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        reset();
        handlePopUpToggle("pkiSubscriber", false);
      }
    });

  return (
    <>
      <Sheet
        open={popUp?.pkiSubscriber?.isOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) requestDiscard();
        }}
      >
        <SheetContent size="form" isPending={isSubmitting}>
          <SheetHeader>
            <SheetTitle>{`${subscriberName ? "Update" : "Add"} PKI Subscriber`}</SheetTitle>
            <SheetDescription>Configure the subscriber certificate settings.</SheetDescription>
          </SheetHeader>
          <form
            key={pkiSubscriber?.id || "new"}
            onSubmit={handleSubmit(onFormSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <fieldset
              disabled={isSubmitting || !isSubscriberReady}
              className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
            >
              <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as FormTab)}>
                <TabsList>
                  <TabsTrigger value={FormTab.Configuration}>Configuration</TabsTrigger>
                  <TabsTrigger value={FormTab.Advanced}>Advanced</TabsTrigger>
                </TabsList>
                <TabsContent className="flex flex-col gap-4" value={FormTab.Configuration}>
                  {pkiSubscriber && (
                    <Field>
                      <FieldLabel>Subscriber ID</FieldLabel>
                      <Input value={pkiSubscriber.id} disabled />
                    </Field>
                  )}
                  <Controller
                    control={control}
                    name="name"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={`${formId}-name`}>
                          Subscriber Name <span className="text-danger">*</span>
                        </FieldLabel>
                        <Input
                          isError={Boolean(error)}
                          id={`${formId}-name`}
                          {...field}
                          placeholder="web-service"
                          autoComplete="off"
                          name="pki-subscriber-name"
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="caId"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={`${formId}-caId`}>
                          Issuing CA <span className="text-danger">*</span>
                        </FieldLabel>
                        <Combobox
                          ref={field.ref}
                          id={`${formId}-caId`}
                          name={field.name}
                          onBlur={field.onBlur}
                          value={cas?.find((ca) => ca.id === field.value) ?? null}
                          onValueChange={(ca) => onChange(ca.id)}
                          options={cas ?? []}
                          getOptionValue={(ca) => ca.id}
                          getOptionLabel={(ca) =>
                            ca.type === CaType.INTERNAL
                              ? `${ca.name} (${ca.configuration.dn})`
                              : ca.name
                          }
                          isClearable={false}
                          isError={Boolean(error)}
                          creation={caCreation}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  {selectedCa?.type === CaType.AZURE_AD_CS && (
                    <Controller
                      control={control}
                      name="azureTemplateType"
                      render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor={`${formId}-azureTemplateType`}>
                            Certificate Template <span className="text-danger">*</span>
                          </FieldLabel>
                          <Select value={field.value} onValueChange={onChange} name={field.name}>
                            <SelectTrigger
                              id={`${formId}-azureTemplateType`}
                              ref={field.ref}
                              onBlur={field.onBlur}
                              className="w-full"
                              isError={Boolean(error)}
                            >
                              <SelectValue placeholder="Select an option" />
                            </SelectTrigger>
                            <SelectContent>
                              {(azureTemplates?.templates || []).map(
                                (template: { id: string; name: string }) => (
                                  <SelectItem value={template.id} key={template.id}>
                                    {template.name}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                  )}
                  <Controller
                    control={control}
                    name="commonName"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={`${formId}-commonName`}>
                          Common Name <span className="text-danger">*</span>
                        </FieldLabel>
                        <Input
                          isError={Boolean(error)}
                          id={`${formId}-commonName`}
                          {...field}
                          placeholder="web.example.com"
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="subjectAlternativeNames"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor={`${formId}-subjectAlternativeNames`}>
                          Subject Alternative Names (SANs)
                        </FieldLabel>
                        <Input
                          isError={Boolean(error)}
                          id={`${formId}-subjectAlternativeNames`}
                          {...field}
                          placeholder="app1.example.com, app2.example.com, ..."
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  {/* Additional Subject Fields - Only for Azure ADCS CAs */}
                  {selectedCa?.type === CaType.AZURE_AD_CS && (
                    <Accordion type="single" collapsible variant="ghost">
                      <AccordionItem value="subject-fields">
                        <AccordionTrigger>
                          <div className="order-1 ml-3">Additional Subject Fields</div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="grid grid-cols-1 gap-4">
                            <Controller
                              control={control}
                              name="organization"
                              render={({ field, fieldState: { error } }) => (
                                <Field data-invalid={Boolean(error)}>
                                  <FieldLabel htmlFor={`${formId}-organization`}>
                                    Organization (O)
                                  </FieldLabel>
                                  <Input
                                    isError={Boolean(error)}
                                    id={`${formId}-organization`}
                                    {...field}
                                    placeholder="Example Corp"
                                    maxLength={64}
                                  />
                                  <FieldDescription>
                                    Maximum 64 characters. No special DN characters allowed. Cannot
                                    start/end with spaces, hyphens, underscores, or periods.
                                  </FieldDescription>
                                  <FieldError>{error?.message}</FieldError>
                                </Field>
                              )}
                            />
                            <Controller
                              control={control}
                              name="organizationalUnit"
                              render={({ field, fieldState: { error } }) => (
                                <Field data-invalid={Boolean(error)}>
                                  <FieldLabel htmlFor={`${formId}-organizationalUnit`}>
                                    Organizational Unit (OU)
                                  </FieldLabel>
                                  <Input
                                    isError={Boolean(error)}
                                    id={`${formId}-organizationalUnit`}
                                    {...field}
                                    placeholder="IT Department"
                                    maxLength={64}
                                  />
                                  <FieldDescription>
                                    Maximum 64 characters. No special DN characters allowed. Cannot
                                    start/end with spaces, hyphens, underscores, or periods.
                                  </FieldDescription>
                                  <FieldError>{error?.message}</FieldError>
                                </Field>
                              )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                              <Controller
                                control={control}
                                name="country"
                                render={({ field, fieldState: { error } }) => (
                                  <Field data-invalid={Boolean(error)}>
                                    <FieldLabel htmlFor={`${formId}-country`}>
                                      Country (C)
                                    </FieldLabel>
                                    <Input
                                      isError={Boolean(error)}
                                      id={`${formId}-country`}
                                      {...field}
                                      placeholder="US"
                                      maxLength={2}
                                      style={{ textTransform: "uppercase" }}
                                    />
                                    <FieldDescription>
                                      Exactly 2 uppercase letters (ISO 3166-1 alpha-2 code).
                                      Examples: US, CA, GB, DE
                                    </FieldDescription>
                                    <FieldError>{error?.message}</FieldError>
                                  </Field>
                                )}
                              />
                              <Controller
                                control={control}
                                name="state"
                                render={({ field, fieldState: { error } }) => (
                                  <Field data-invalid={Boolean(error)}>
                                    <FieldLabel htmlFor={`${formId}-state`}>
                                      State/Province (ST)
                                    </FieldLabel>
                                    <Input
                                      isError={Boolean(error)}
                                      id={`${formId}-state`}
                                      {...field}
                                      placeholder="California"
                                      maxLength={64}
                                    />
                                    <FieldDescription>
                                      Maximum 64 characters. No special DN characters allowed.
                                      Cannot start/end with spaces, hyphens, underscores, or
                                      periods.
                                    </FieldDescription>
                                    <FieldError>{error?.message}</FieldError>
                                  </Field>
                                )}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <Controller
                                control={control}
                                name="locality"
                                render={({ field, fieldState: { error } }) => (
                                  <Field data-invalid={Boolean(error)}>
                                    <FieldLabel htmlFor={`${formId}-locality`}>
                                      Locality (L)
                                    </FieldLabel>
                                    <Input
                                      isError={Boolean(error)}
                                      id={`${formId}-locality`}
                                      {...field}
                                      placeholder="San Francisco"
                                      maxLength={64}
                                    />
                                    <FieldDescription>
                                      Maximum 64 characters. No special DN characters allowed.
                                      Cannot start/end with spaces, hyphens, underscores, or
                                      periods.
                                    </FieldDescription>
                                    <FieldError>{error?.message}</FieldError>
                                  </Field>
                                )}
                              />
                              <Controller
                                control={control}
                                name="emailAddress"
                                render={({ field, fieldState: { error } }) => (
                                  <Field data-invalid={Boolean(error)}>
                                    <FieldLabel htmlFor={`${formId}-emailAddress`}>
                                      Email Address
                                    </FieldLabel>
                                    <Input
                                      isError={Boolean(error)}
                                      id={`${formId}-emailAddress`}
                                      {...field}
                                      type="email"
                                      placeholder="admin@example.com"
                                      maxLength={64}
                                    />
                                    <FieldDescription>
                                      Valid email format, 6-64 characters. Example:
                                      admin@example.com
                                    </FieldDescription>
                                    <FieldError>{error?.message}</FieldError>
                                  </Field>
                                )}
                              />
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                  {selectedCa?.type !== CaType.ACME && (
                    <Controller
                      control={control}
                      name="ttl"
                      render={({ field, fieldState: { error } }) => (
                        <Field data-invalid={Boolean(error)}>
                          <FieldLabel htmlFor={`${formId}-ttl`}>
                            TTL <span className="text-danger">*</span>
                          </FieldLabel>
                          <Input
                            isError={Boolean(error)}
                            id={`${formId}-ttl`}
                            {...field}
                            placeholder="2 days, 1d, 2h, 1y, ..."
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                  )}
                  {selectedCa?.type !== CaType.ACME && selectedCa?.type !== CaType.AZURE_AD_CS && (
                    <Accordion type="single" collapsible variant="ghost">
                      <AccordionItem value="key-usages">
                        <AccordionTrigger>
                          <div className="order-1 ml-3">Key Usage</div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <Controller
                            control={control}
                            name="keyUsages"
                            render={({ field: { onChange, value }, fieldState: { error } }) => {
                              return (
                                <Field data-invalid={Boolean(error)}>
                                  <FieldLabel htmlFor={`${formId}-keyUsages`}>Key Usage</FieldLabel>
                                  <div className="mt-2 mb-7 grid grid-cols-2 gap-2">
                                    {KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => {
                                      return (
                                        <Field key={optionValue} orientation="horizontal">
                                          <Checkbox
                                            id={optionValue}
                                            isChecked={value[optionValue]}
                                            onCheckedChange={(state) => {
                                              onChange({
                                                ...value,
                                                [optionValue]: state
                                              });
                                            }}
                                            variant="project"
                                          />
                                          <FieldLabel htmlFor={optionValue}>{label}</FieldLabel>
                                        </Field>
                                      );
                                    })}
                                  </div>
                                  <FieldError>{error?.message}</FieldError>
                                </Field>
                              );
                            }}
                          />
                          <Controller
                            control={control}
                            name="extendedKeyUsages"
                            render={({ field: { onChange, value }, fieldState: { error } }) => {
                              return (
                                <Field data-invalid={Boolean(error)}>
                                  <FieldLabel htmlFor={`${formId}-extendedKeyUsages`}>
                                    Extended Key Usage
                                  </FieldLabel>
                                  <div className="mt-2 mb-7 grid grid-cols-2 gap-2">
                                    {EXTENDED_KEY_USAGES_OPTIONS.map(
                                      ({ label, value: optionValue }) => {
                                        return (
                                          <Field key={optionValue} orientation="horizontal">
                                            <Checkbox
                                              id={optionValue}
                                              isChecked={value[optionValue]}
                                              onCheckedChange={(state) => {
                                                onChange({
                                                  ...value,
                                                  [optionValue]: state
                                                });
                                              }}
                                              variant="project"
                                            />
                                            <FieldLabel htmlFor={optionValue}>{label}</FieldLabel>
                                          </Field>
                                        );
                                      }
                                    )}
                                  </div>
                                  <FieldError>{error?.message}</FieldError>
                                </Field>
                              );
                            }}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </TabsContent>
                <TabsContent className="flex flex-col gap-4" value={FormTab.Advanced}>
                  <Controller
                    control={control}
                    name="enableAutoRenewal"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <Field orientation="horizontal">
                          <Checkbox
                            id="enableAutoRenewal"
                            isChecked={value}
                            onCheckedChange={onChange}
                            variant="project"
                          />
                          <FieldLabel htmlFor="enableAutoRenewal">
                            Enable Certificate Auto Renewal
                          </FieldLabel>
                        </Field>
                        <FieldDescription>
                          If enabled, a new certificate will be issued automatically X days before
                          the current certificate expires.
                        </FieldDescription>
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  {selectedAutoRenewalState && (
                    <div className="flex items-center">
                      <Controller
                        control={control}
                        defaultValue={7}
                        name="renewalBefore"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                          <Field className="w-full" data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor={`${formId}-renewalBefore`}>
                              Renewal Before <span className="text-danger">*</span>
                            </FieldLabel>
                            <Input
                              isError={Boolean(error)}
                              id={`${formId}-renewalBefore`}
                              {...field}
                              placeholder="5"
                              type="number"
                              min={1}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                onChange(val === "" ? "" : Number(val));
                              }}
                            />
                            <FieldError>{error?.message}</FieldError>
                          </Field>
                        )}
                      />
                      <Controller
                        control={control}
                        name="renewalUnit"
                        defaultValue={TimeUnit.DAY}
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                          <Field className="ml-4" data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor={`${formId}-renewalUnit`}>Unit</FieldLabel>
                            <Select value={field.value} onValueChange={onChange} name={field.name}>
                              <SelectTrigger
                                id={`${formId}-renewalUnit`}
                                ref={field.ref}
                                onBlur={field.onBlur}
                                className="w-full"
                                isError={Boolean(error)}
                              >
                                <SelectValue placeholder="Select an option" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={TimeUnit.DAY}>Days</SelectItem>
                                <SelectItem value={TimeUnit.WEEK}>Weeks</SelectItem>
                                <SelectItem value={TimeUnit.MONTH}>Months</SelectItem>
                                <SelectItem value={TimeUnit.YEAR}>Years</SelectItem>
                              </SelectContent>
                            </Select>
                            <FieldError>{error?.message}</FieldError>
                          </Field>
                        )}
                      />
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </fieldset>
            <SheetFooter className="justify-end border-t">
              <SheetClose asChild>
                <Button variant="ghost">Cancel</Button>
              </SheetClose>
              <Button
                variant="project"
                type="submit"
                isPending={isSubmitting}
                isDisabled={!isSubscriberReady}
              >
                {subscriberName ? "Update" : "Add"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {caCreationModals}
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved changes will be lost."
      />
    </>
  );
};
