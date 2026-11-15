import { useEffect, useRef, useState } from "react";
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
  FieldFeedback,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  CaStatus,
  useCreateCertificate,
  useGetCert,
  useGetCertTemplate,
  useListWorkspaceCas,
  useListWorkspaceCertificateTemplates,
  useListWorkspacePkiCollections
} from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";
import {
  buildExtendedKeyUsageToggleSchema,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";
import { useCaCreation } from "@app/pages/cert-manager/components/useCaCreation";

import { PkiCollectionModal } from "../../AlertingPage/components/PkiCollectionModal";
import { CertificateContent } from "./CertificateContent";

const schema = z.object({
  certificateTemplateId: z.string().optional(),
  caId: z.string(),
  collectionId: z.string().optional(),
  commonName: z.string().trim().min(1),
  subjectAltNames: z.string(),
  ttl: z.string().trim(),
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
  })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["certificate"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["certificate"]>, state?: boolean) => void;
  preselectedTemplate?: { id: string; name: string };
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey: string;
};

const CERT_TEMPLATE_NONE_VALUE = "none";

export const CertificateModal = ({ popUp, handlePopUpToggle, preselectedTemplate }: Props) => {
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const initialValuesRef = useRef<FormData | null>(null);
  const hydratedTemplateId = useRef<string | null>(null);
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const collectionPopup = usePopUp(["pkiCollection"] as const);
  const { data: cert } = useGetCert(
    (popUp?.certificate?.data as { serialNumber: string })?.serialNumber || ""
  );

  const { data: cas, refetch: refetchCas } = useListWorkspaceCas({
    projectId: currentProject.id,
    status: CaStatus.ACTIVE
  });

  const { data, refetch: refetchCollections } = useListWorkspacePkiCollections({
    projectId: currentProject?.id || ""
  });

  const { data: templatesData } = useListWorkspaceCertificateTemplates({
    projectId: currentProject?.id || ""
  });

  const { mutateAsync: createCertificate } = useCreateCertificate();

  const {
    control,
    handleSubmit,
    reset,
    resetField,
    getFieldState,
    formState: { isDirty, isSubmitting, dirtyFields },
    setValue,
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      keyUsages: {
        [CertKeyUsage.DIGITAL_SIGNATURE]: true,
        [CertKeyUsage.KEY_ENCIPHERMENT]: true
      },
      extendedKeyUsages: {}
    }
  });

  const closeSheet = () => {
    handlePopUpToggle("certificate", false);
    reset();
    setCertificateDetails(null);
  };
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty: !cert && !certificateDetails && isDirty,
      onDiscard: closeSheet
    });

  const selectedCertTemplateId = watch("certificateTemplateId");
  const { creation: caCreation, caCreationModals } = useCaCreation<NonNullable<typeof cas>[number]>(
    async (ca) => {
      const result = await refetchCas();
      if (!result.data?.some((option) => option.id === ca.id)) {
        createNotification({
          type: "error",
          text: "The certificate authority was created, but is not available for this certificate request yet."
        });
        return;
      }
      setValue("caId", ca.id, { shouldDirty: true, shouldValidate: true });
    }
  );
  const hasCertTemplateSelected =
    selectedCertTemplateId !== "" && selectedCertTemplateId !== CERT_TEMPLATE_NONE_VALUE;

  const { data: selectedCertTemplate } = useGetCertTemplate(
    hasCertTemplateSelected ? (selectedCertTemplateId as string) : ""
  );

  useEffect(() => {
    if (cert) {
      reset({
        caId: cert.caId,
        commonName: cert.commonName,
        subjectAltNames: cert.subjectAltNames,
        certificateTemplateId: cert.certificateTemplateId ?? CERT_TEMPLATE_NONE_VALUE,
        ttl: "",
        keyUsages: Object.fromEntries((cert.keyUsages || []).map((name) => [name, true])),
        extendedKeyUsages: Object.fromEntries(
          (cert.extendedKeyUsages || []).map((name) => [name, true])
        )
      });
    } else if (popUp?.certificate?.isOpen) {
      const templateId = preselectedTemplate?.id || CERT_TEMPLATE_NONE_VALUE;

      const initialValues: FormData = {
        caId: cas?.[0]?.id ?? "",
        commonName: "",
        subjectAltNames: "",
        ttl: "",
        certificateTemplateId: templateId,
        keyUsages: {
          [CertKeyUsage.DIGITAL_SIGNATURE]: true,
          [CertKeyUsage.KEY_ENCIPHERMENT]: true
        },
        extendedKeyUsages: {}
      };
      initialValuesRef.current = initialValues;
      hydratedTemplateId.current = null;
      reset(initialValues);
    }
  }, [cert, preselectedTemplate?.id, popUp?.certificate?.isOpen]);

  useEffect(() => {
    if (!hasCertTemplateSelected) {
      hydratedTemplateId.current = null;
      return;
    }
    if (
      cert ||
      !popUp.certificate.isOpen ||
      !selectedCertTemplate ||
      selectedCertTemplate.id !== selectedCertTemplateId ||
      hydratedTemplateId.current === selectedCertTemplateId
    )
      return;

    const templateValues = {
      ttl: selectedCertTemplate.ttl,
      keyUsages: Object.fromEntries(selectedCertTemplate.keyUsages.map((name) => [name, true])),
      extendedKeyUsages: Object.fromEntries(
        selectedCertTemplate.extendedKeyUsages.map((name) => [name, true])
      )
    };
    if (
      initialValuesRef.current &&
      initialValuesRef.current.certificateTemplateId === selectedCertTemplateId &&
      hydratedTemplateId.current === null
    ) {
      reset(
        { ...initialValuesRef.current, ...templateValues },
        {
          keepDirtyValues: Object.keys(dirtyFields).length > 0
        }
      );
    } else {
      setValue("ttl", templateValues.ttl);
      setValue("keyUsages", templateValues.keyUsages);
      setValue("extendedKeyUsages", templateValues.extendedKeyUsages);
    }
    hydratedTemplateId.current = selectedCertTemplateId as string;
  }, [
    selectedCertTemplate,
    selectedCertTemplateId,
    hasCertTemplateSelected,
    cert,
    popUp.certificate.isOpen,
    dirtyFields
  ]);

  const onFormSubmit = async ({
    caId,
    collectionId,
    commonName,
    subjectAltNames,
    ttl,
    keyUsages,
    extendedKeyUsages
  }: FormData) => {
    if (!currentProject?.id) return;

    const { serialNumber, certificate, certificateChain, privateKey } = await createCertificate({
      caId: !selectedCertTemplate ? caId : undefined,
      certificateTemplateId: selectedCertTemplate ? selectedCertTemplateId : undefined,
      pkiCollectionId: collectionId,
      commonName,
      subjectAltNames,
      ttl,
      keyUsages: Object.entries(keyUsages)
        .filter(([, value]) => value)
        .map(([key]) =>
          key === CertKeyUsage.CRL_SIGN
            ? "cRLSign"
            : key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
        ),
      extendedKeyUsages: Object.entries(extendedKeyUsages)
        .filter(([, value]) => value)
        .map(([key]) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()))
    });

    reset();

    setCertificateDetails({
      serialNumber,
      certificate,
      certificateChain,
      privateKey
    });

    createNotification({
      text: "Successfully created certificate",
      type: "success"
    });
  };

  useEffect(() => {
    if (cas?.length && !cert && popUp.certificate.isOpen && !getFieldState("caId").isDirty) {
      resetField("caId", { defaultValue: cas[0].id });
    }
  }, [cas, cert, popUp.certificate.isOpen]);

  return (
    <>
      <Sheet
        open={popUp?.certificate?.isOpen}
        onOpenChange={(isOpen) => {
          if (isSubmitting) return;
          if (!isOpen) {
            requestDiscard();
            return;
          }
          handlePopUpToggle("certificate", true);
        }}
      >
        <SheetContent size="form" isPending={isSubmitting}>
          <SheetHeader>
            <SheetTitle>{cert ? "View" : "Request"} Certificate</SheetTitle>
            <SheetDescription>
              {certificateDetails
                ? "Copy or download the issued certificate and private key."
                : "Certificate subject, lifetime, and key usage details."}
            </SheetDescription>
          </SheetHeader>
          {!certificateDetails ? (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                if (isSubmitting || cert) {
                  event.preventDefault();
                  return;
                }
                handleSubmit(onFormSubmit)(event);
              }}
            >
              <div className="min-h-0 thin-scrollbar flex-1 overflow-y-auto p-4">
                <FieldGroup>
                  <Controller
                    control={control}
                    name="certificateTemplateId"
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="certificate-template">Certificate Template</FieldLabel>
                        <Select
                          name={field.name}
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={Boolean(cert) || Boolean(preselectedTemplate) || isSubmitting}
                        >
                          <SelectTrigger
                            id="certificate-template"
                            ref={field.ref}
                            onBlur={field.onBlur}
                            isError={Boolean(error)}
                            aria-required
                            aria-describedby="certificate-template-feedback"
                          >
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={CERT_TEMPLATE_NONE_VALUE} key="cert-template-none">
                              None
                            </SelectItem>
                            {preselectedTemplate &&
                              !templatesData?.certificateTemplates?.find(
                                (t) => t.id === preselectedTemplate.id
                              ) && (
                                <SelectItem
                                  value={preselectedTemplate.id}
                                  key={`cert-template-preselected-${preselectedTemplate.id}`}
                                >
                                  {preselectedTemplate.name}
                                </SelectItem>
                              )}
                            {(templatesData?.certificateTemplates || []).map(({ id, name }) => (
                              <SelectItem value={id} key={`cert-template-${id}`}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldFeedback
                          id="certificate-template-feedback"
                          error={error?.message}
                          description="When a template is selected, the details provided are validated against the template policies."
                        />
                      </Field>
                    )}
                  />
                  {(!selectedCertTemplateId ||
                    selectedCertTemplateId === CERT_TEMPLATE_NONE_VALUE ||
                    cert) && (
                    <>
                      <Controller
                        control={control}
                        name="caId"
                        render={({ field, fieldState: { error } }) => (
                          <Field data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor="certificate-ca">Issuing CA</FieldLabel>
                            <Combobox
                              ref={field.ref}
                              name={field.name}
                              id="certificate-ca"
                              onBlur={field.onBlur}
                              value={cas?.find((ca) => ca.id === field.value) ?? null}
                              onValueChange={(ca) => field.onChange(ca.id)}
                              options={cas ?? []}
                              getOptionValue={(ca) => ca.id}
                              getOptionLabel={(ca) => `${caTypeToNameMap[ca.type]}: ${ca.dn}`}
                              isClearable={false}
                              isDisabled={Boolean(cert) || isSubmitting}
                              isError={Boolean(error)}
                              aria-required
                              aria-describedby="certificate-ca-feedback"
                              placeholder="Select a certificate authority"
                              creation={!cert ? caCreation : undefined}
                            />
                            <FieldFeedback id="certificate-ca-feedback" error={error?.message} />
                          </Field>
                        )}
                      />
                      <Controller
                        control={control}
                        name="collectionId"
                        render={({ field, fieldState: { error } }) => (
                          <Field data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor="certificate-collection">
                              Certificate Collection (Optional)
                            </FieldLabel>
                            <Combobox
                              ref={field.ref}
                              name={field.name}
                              id="certificate-collection"
                              onBlur={field.onBlur}
                              value={
                                data?.collections.find(
                                  (collection) => collection.id === field.value
                                ) ?? null
                              }
                              onValueChange={(collection) => field.onChange(collection.id)}
                              options={data?.collections ?? []}
                              getOptionValue={(collection) => collection.id}
                              getOptionLabel={(collection) => collection.name}
                              isClearable={false}
                              isDisabled={Boolean(cert) || isSubmitting}
                              isError={Boolean(error)}
                              aria-describedby="certificate-collection-feedback"
                              placeholder="Select a certificate collection"
                              creation={
                                !cert &&
                                permission.can(
                                  ProjectPermissionActions.Create,
                                  ProjectPermissionSub.PkiCollections
                                )
                                  ? {
                                      mode: "action",
                                      emptyLabel: "Create New Collection",
                                      formatLabel: () => "Create New Collection",
                                      onAction: () =>
                                        collectionPopup.handlePopUpOpen("pkiCollection")
                                    }
                                  : undefined
                              }
                            />
                            <FieldFeedback
                              id="certificate-collection-feedback"
                              error={error?.message}
                            />
                          </Field>
                        )}
                      />
                    </>
                  )}
                  <Controller
                    control={control}
                    defaultValue=""
                    name="commonName"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="certificate-common-name">Common Name (CN)</FieldLabel>
                        <Input
                          {...field}
                          id="certificate-common-name"
                          placeholder="service.acme.com"
                          disabled={Boolean(cert) || isSubmitting}
                          isError={Boolean(error)}
                          aria-required
                          aria-describedby="certificate-common-name-feedback"
                        />
                        <FieldFeedback
                          id="certificate-common-name-feedback"
                          error={error?.message}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    defaultValue=""
                    name="subjectAltNames"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="certificate-alternative-names">
                          Alternative Names (SANs)
                        </FieldLabel>
                        <Input
                          {...field}
                          id="certificate-alternative-names"
                          placeholder="app1.acme.com, app2.acme.com, ..."
                          disabled={Boolean(cert) || isSubmitting}
                          isError={Boolean(error)}
                          aria-describedby="certificate-alternative-names-feedback"
                        />
                        <FieldFeedback
                          id="certificate-alternative-names-feedback"
                          error={error?.message}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="ttl"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)}>
                        <FieldLabel htmlFor="certificate-ttl">TTL</FieldLabel>
                        <Input
                          {...field}
                          id="certificate-ttl"
                          placeholder="2 days, 1d, 2h, 1y, ..."
                          disabled={Boolean(cert) || isSubmitting}
                          isError={Boolean(error)}
                          aria-required
                          aria-describedby="certificate-ttl-feedback"
                        />
                        <FieldFeedback id="certificate-ttl-feedback" error={error?.message} />
                      </Field>
                    )}
                  />
                  <Accordion type="single" collapsible variant="ghost">
                    <AccordionItem value="key-usages">
                      <AccordionTrigger>Key Usage</AccordionTrigger>
                      <AccordionContent>
                        <FieldGroup>
                          <Controller
                            control={control}
                            name="keyUsages"
                            render={({ field: { onChange, value }, fieldState: { error } }) => (
                              <FieldSet aria-describedby="certificate-key-usages-feedback">
                                <FieldLegend variant="label">Key Usage</FieldLegend>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  {KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => (
                                    <Field
                                      orientation="horizontal"
                                      key={optionValue}
                                      data-disabled={Boolean(cert) || isSubmitting}
                                    >
                                      <Checkbox
                                        id={`certificate-key-usage-${optionValue}`}
                                        isDisabled={Boolean(cert) || isSubmitting}
                                        isChecked={Boolean(value[optionValue])}
                                        onCheckedChange={(state) => {
                                          onChange({
                                            ...value,
                                            [optionValue]: state === true
                                          });
                                        }}
                                      />
                                      <FieldLabel htmlFor={`certificate-key-usage-${optionValue}`}>
                                        {label}
                                      </FieldLabel>
                                    </Field>
                                  ))}
                                </div>
                                <FieldFeedback
                                  id="certificate-key-usages-feedback"
                                  error={error?.message}
                                />
                              </FieldSet>
                            )}
                          />
                          <Controller
                            control={control}
                            name="extendedKeyUsages"
                            render={({ field: { onChange, value }, fieldState: { error } }) => (
                              <FieldSet aria-describedby="certificate-extended-key-usages-feedback">
                                <FieldLegend variant="label">Extended Key Usage</FieldLegend>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  {EXTENDED_KEY_USAGES_OPTIONS.map(
                                    ({ label, value: optionValue }) => (
                                      <Field
                                        orientation="horizontal"
                                        key={optionValue}
                                        data-disabled={Boolean(cert) || isSubmitting}
                                      >
                                        <Checkbox
                                          id={`certificate-extended-key-usage-${optionValue}`}
                                          isDisabled={Boolean(cert) || isSubmitting}
                                          isChecked={Boolean(value[optionValue])}
                                          onCheckedChange={(state) => {
                                            onChange({
                                              ...value,
                                              [optionValue]: state === true
                                            });
                                          }}
                                        />
                                        <FieldLabel
                                          htmlFor={`certificate-extended-key-usage-${optionValue}`}
                                        >
                                          {label}
                                        </FieldLabel>
                                      </Field>
                                    )
                                  )}
                                </div>
                                <FieldFeedback
                                  id="certificate-extended-key-usages-feedback"
                                  error={error?.message}
                                />
                              </FieldSet>
                            )}
                          />
                        </FieldGroup>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </FieldGroup>
              </div>
              <SheetFooter className="justify-end border-t">
                <Button variant="ghost" onClick={requestDiscard} isDisabled={isSubmitting}>
                  {cert ? "Close" : "Cancel"}
                </Button>
                {!cert && (
                  <Button variant="project" type="submit" isPending={isSubmitting}>
                    Create
                  </Button>
                )}
              </SheetFooter>
            </form>
          ) : (
            <>
              <div className="min-h-0 thin-scrollbar flex-1 overflow-y-auto p-4">
                <CertificateContent
                  serialNumber={certificateDetails.serialNumber}
                  certificate={certificateDetails.certificate}
                  certificateChain={certificateDetails.certificateChain}
                  privateKey={certificateDetails.privateKey}
                />
              </div>
              <SheetFooter className="justify-end border-t">
                <Button variant="ghost" onClick={requestDiscard} isDisabled={isSubmitting}>
                  Close
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      {caCreationModals}
      <PkiCollectionModal
        popUp={collectionPopup.popUp}
        handlePopUpToggle={collectionPopup.handlePopUpToggle}
        onComplete={async (collection) => {
          const result = await refetchCollections();
          if (!result.data?.collections.some((option) => option.id === collection.id)) {
            createNotification({
              type: "error",
              text: "The collection was created, but the list could not be refreshed. Refresh the list to select it."
            });
            return;
          }
          setValue("collectionId", collection.id, { shouldDirty: true, shouldValidate: true });
        }}
      />
      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your unsaved certificate request details will be lost."
      />
    </>
  );
};
