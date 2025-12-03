import { useEffect, useState } from "react";
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
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
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
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { convertTimeUnitValueToDays, TimeUnit } from "@app/lib/fn/date";

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
      [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
      [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
      [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
      [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
      [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
      [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
    }),
    enableAutoRenewal: z.boolean().optional().default(false),
    renewalBefore: z.number().min(1).optional(),
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
  const projectId = currentProject.id;
  const { data: subscribers } = useListWorkspacePkiSubscribers(projectId);
  const { data: cas } = useListCasByProjectId(projectId);
  const [tabValue, setTabValue] = useState<FormTab>(FormTab.Configuration);

  const { data: pkiSubscriber } = useGetPkiSubscriber({
    subscriberName:
      (popUp?.pkiSubscriber?.data as { subscriberName: string })?.subscriberName || "",
    projectId
  });

  const { mutateAsync: createMutateAsync } = useCreatePkiSubscriber();
  const { mutateAsync: updateMutateAsync } = useUpdatePkiSubscriber();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting }
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
  const selectedCa = cas?.find((ca) => ca.id === selectedCaId);
  const selectedAutoRenewalState = watch("enableAutoRenewal");

  // Fetch Azure ADCS templates when Azure CA is selected
  const { data: azureTemplates } = useGetAzureAdcsTemplates({
    caId: selectedCa?.type === CaType.AZURE_AD_CS ? selectedCaId : "",
    projectId,
    isAzureAdcsCa: true
  });

  // Initialize form with ALL subscriber data including template
  useEffect(() => {
    if (pkiSubscriber) {
      // Set all values directly and immediately
      setValue("name", pkiSubscriber.name);
      setValue("caId", pkiSubscriber.caId || "");
      setValue("commonName", pkiSubscriber.commonName);
      setValue("subjectAlternativeNames", pkiSubscriber.subjectAlternativeNames.join(", "));
      setValue("ttl", pkiSubscriber.ttl || "");
      setValue(
        "keyUsages",
        Object.fromEntries((pkiSubscriber.keyUsages || []).map((name) => [name, true]))
      );
      setValue(
        "extendedKeyUsages",
        Object.fromEntries((pkiSubscriber.extendedKeyUsages || []).map((name) => [name, true]))
      );
      setValue("enableAutoRenewal", pkiSubscriber.enableAutoRenewal || false);
      setValue("renewalBefore", pkiSubscriber.autoRenewalPeriodInDays || 7);
      setValue("renewalUnit", TimeUnit.DAY);

      // Set Azure template immediately
      setValue("azureTemplateType", pkiSubscriber.properties?.azureTemplateType || "");

      // Set all Additional Subject Fields immediately
      setValue("organization", pkiSubscriber.properties?.organization || "");
      setValue("organizationalUnit", pkiSubscriber.properties?.organizationalUnit || "");
      setValue("country", pkiSubscriber.properties?.country || "");
      setValue("state", pkiSubscriber.properties?.state || "");
      setValue("locality", pkiSubscriber.properties?.locality || "");
      setValue("emailAddress", pkiSubscriber.properties?.emailAddress || "");
    }
  }, [pkiSubscriber, setValue]);

  useEffect(() => {
    if (cas?.length && !pkiSubscriber) {
      // Only auto-select first CA when creating new subscriber, not when updating
      setValue("caId", cas[0].id);
    }
  }, [cas, setValue, pkiSubscriber]);

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
    if (!projectId) return;

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
        projectId,
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
        projectId,
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

  return (
    <Modal
      isOpen={popUp?.pkiSubscriber?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("pkiSubscriber", isOpen);
      }}
    >
      <ModalContent title={`${pkiSubscriber ? "Update" : "Add"} PKI Subscriber`}>
        <form key={pkiSubscriber?.id || "new"} onSubmit={handleSubmit(onFormSubmit)}>
          <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as FormTab)}>
            <TabList>
              <Tab value={FormTab.Configuration}>Configuration</Tab>
              <Tab value={FormTab.Advanced}>Advanced</Tab>
            </TabList>
            <TabPanel value={FormTab.Configuration}>
              {pkiSubscriber && (
                <FormControl label="Subscriber ID">
                  <Input value={pkiSubscriber.id} isDisabled className="bg-white/[0.07]" />
                </FormControl>
              )}
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Subscriber Name"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="web-service" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="caId"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Issuing CA"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    isRequired
                  >
                    <Select
                      value={field.value}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                    >
                      {(cas || []).map(({ id, name, type, configuration }) => {
                        const displayName =
                          type === CaType.INTERNAL ? `${name} (${configuration.dn})` : name;

                        return (
                          <SelectItem value={id} key={`ca-${id}`}>
                            {displayName}
                          </SelectItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                )}
              />
              {selectedCa?.type === CaType.AZURE_AD_CS && (
                <Controller
                  control={control}
                  name="azureTemplateType"
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="Certificate Template"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      isRequired
                    >
                      <Select
                        value={field.value}
                        onValueChange={(e) => onChange(e)}
                        className="w-full"
                      >
                        {(azureTemplates?.templates || []).map(
                          (template: { id: string; name: string }) => (
                            <SelectItem value={template.id} key={template.id}>
                              {template.name}
                            </SelectItem>
                          )
                        )}
                      </Select>
                    </FormControl>
                  )}
                />
              )}
              <Controller
                control={control}
                name="commonName"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Common Name"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="web.example.com" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="subjectAlternativeNames"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Subject Alternative Names (SANs)"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="app1.example.com, app2.example.com, ..." />
                  </FormControl>
                )}
              />

              {/* Additional Subject Fields - Only for Azure ADCS CAs */}
              {selectedCa?.type === CaType.AZURE_AD_CS && (
                <Accordion type="single" collapsible className="mb-4 w-full">
                  <AccordionItem value="subject-fields" className="data-[state=open]:border-none">
                    <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
                      <div className="order-1 ml-3">Additional Subject Fields</div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-1 gap-4">
                        <Controller
                          control={control}
                          name="organization"
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              label="Organization (O)"
                              isError={Boolean(error)}
                              errorText={error?.message}
                              tooltipText="Maximum 64 characters. No special DN characters allowed. Cannot start/end with spaces, hyphens, underscores, or periods."
                            >
                              <Input {...field} placeholder="Example Corp" maxLength={64} />
                            </FormControl>
                          )}
                        />
                        <Controller
                          control={control}
                          name="organizationalUnit"
                          render={({ field, fieldState: { error } }) => (
                            <FormControl
                              label="Organizational Unit (OU)"
                              isError={Boolean(error)}
                              errorText={error?.message}
                              tooltipText="Maximum 64 characters. No special DN characters allowed. Cannot start/end with spaces, hyphens, underscores, or periods."
                            >
                              <Input {...field} placeholder="IT Department" maxLength={64} />
                            </FormControl>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <Controller
                            control={control}
                            name="country"
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Country (C)"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                tooltipText="Exactly 2 uppercase letters (ISO 3166-1 alpha-2 code). Examples: US, CA, GB, DE"
                              >
                                <Input
                                  {...field}
                                  placeholder="US"
                                  maxLength={2}
                                  style={{ textTransform: "uppercase" }}
                                />
                              </FormControl>
                            )}
                          />
                          <Controller
                            control={control}
                            name="state"
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="State/Province (ST)"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                tooltipText="Maximum 64 characters. No special DN characters allowed. Cannot start/end with spaces, hyphens, underscores, or periods."
                              >
                                <Input {...field} placeholder="California" maxLength={64} />
                              </FormControl>
                            )}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Controller
                            control={control}
                            name="locality"
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Locality (L)"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                tooltipText="Maximum 64 characters. No special DN characters allowed. Cannot start/end with spaces, hyphens, underscores, or periods."
                              >
                                <Input {...field} placeholder="San Francisco" maxLength={64} />
                              </FormControl>
                            )}
                          />
                          <Controller
                            control={control}
                            name="emailAddress"
                            render={({ field, fieldState: { error } }) => (
                              <FormControl
                                label="Email Address"
                                isError={Boolean(error)}
                                errorText={error?.message}
                                tooltipText="Valid email format, 6-64 characters. Example: admin@example.com"
                              >
                                <Input
                                  {...field}
                                  type="email"
                                  placeholder="admin@example.com"
                                  maxLength={64}
                                />
                              </FormControl>
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
                    <FormControl
                      label="TTL"
                      isError={Boolean(error)}
                      errorText={error?.message}
                      isRequired
                    >
                      <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
                    </FormControl>
                  )}
                />
              )}
              {selectedCa?.type !== CaType.ACME && selectedCa?.type !== CaType.AZURE_AD_CS && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="key-usages" className="data-[state=open]:border-none">
                    <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
                      <div className="order-1 ml-3">Key Usage</div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Controller
                        control={control}
                        name="keyUsages"
                        render={({ field: { onChange, value }, fieldState: { error } }) => {
                          return (
                            <FormControl
                              label="Key Usage"
                              errorText={error?.message}
                              isError={Boolean(error)}
                            >
                              <div className="mt-2 mb-7 grid grid-cols-2 gap-2">
                                {KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => {
                                  return (
                                    <Checkbox
                                      id={optionValue}
                                      key={optionValue}
                                      isChecked={value[optionValue]}
                                      onCheckedChange={(state) => {
                                        onChange({
                                          ...value,
                                          [optionValue]: state
                                        });
                                      }}
                                    >
                                      {label}
                                    </Checkbox>
                                  );
                                })}
                              </div>
                            </FormControl>
                          );
                        }}
                      />
                      <Controller
                        control={control}
                        name="extendedKeyUsages"
                        render={({ field: { onChange, value }, fieldState: { error } }) => {
                          return (
                            <FormControl
                              label="Extended Key Usage"
                              errorText={error?.message}
                              isError={Boolean(error)}
                            >
                              <div className="mt-2 mb-7 grid grid-cols-2 gap-2">
                                {EXTENDED_KEY_USAGES_OPTIONS.map(
                                  ({ label, value: optionValue }) => {
                                    return (
                                      <Checkbox
                                        id={optionValue}
                                        key={optionValue}
                                        isChecked={value[optionValue]}
                                        onCheckedChange={(state) => {
                                          onChange({
                                            ...value,
                                            [optionValue]: state
                                          });
                                        }}
                                      >
                                        {label}
                                      </Checkbox>
                                    );
                                  }
                                )}
                              </div>
                            </FormControl>
                          );
                        }}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </TabPanel>
            <TabPanel value={FormTab.Advanced}>
              <Controller
                control={control}
                name="enableAutoRenewal"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error)}
                    errorText={error?.message}
                    tooltipText="If enabled, a new certificate will be issued automatically X days before the current certificate expires."
                  >
                    <Checkbox id="enableAutoRenewal" isChecked={value} onCheckedChange={onChange}>
                      Enable Certificate Auto Renewal
                    </Checkbox>
                  </FormControl>
                )}
              />
              {selectedAutoRenewalState && (
                <div className="flex items-center">
                  <Controller
                    control={control}
                    defaultValue={7}
                    name="renewalBefore"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="Renewal Before"
                        isError={Boolean(error)}
                        errorText={error?.message}
                        className="w-full"
                        isRequired
                      >
                        <Input
                          {...field}
                          placeholder="5"
                          type="number"
                          min={1}
                          onChange={(e) => onChange(Number(e.target.value))}
                        />
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name="renewalUnit"
                    defaultValue={TimeUnit.DAY}
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        className="ml-4"
                        label="Unit"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <Select
                          value={field.value}
                          onValueChange={(e) => onChange(e)}
                          className="w-48"
                        >
                          <SelectItem value={TimeUnit.DAY}>Days</SelectItem>
                          <SelectItem value={TimeUnit.WEEK}>Weeks</SelectItem>
                          <SelectItem value={TimeUnit.MONTH}>Months</SelectItem>
                          <SelectItem value={TimeUnit.YEAR}>Years</SelectItem>
                        </Select>
                      </FormControl>
                    )}
                  />
                </div>
              )}
            </TabPanel>
          </Tabs>
          <div className="mt-4 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {pkiSubscriber ? "Update" : "Add"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("pkiSubscriber", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
