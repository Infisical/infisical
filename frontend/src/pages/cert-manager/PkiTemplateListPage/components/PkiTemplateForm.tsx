import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelpIcon } from "lucide-react";
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
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useCreateCertTemplateV2,
  useListCasByProjectId,
  useUpdateCertTemplateV2
} from "@app/hooks/api";
import {
  buildExtendedKeyUsageToggleSchema,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { TCertificateTemplateV2 } from "@app/hooks/api/certificateTemplates/types";
import { slugSchema } from "@app/lib/schemas";
import { useCaCreation } from "@app/pages/cert-manager/components/useCaCreation";

const validateTemplateRegexField = z.string().trim().min(1).max(100);

const schema = z.object({
  ca: z.object({
    name: z.string(),
    id: z.string()
  }),
  name: slugSchema(),
  commonName: validateTemplateRegexField,
  subjectAlternativeName: validateTemplateRegexField,
  ttl: z.string().trim().min(1),
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
  onCancel: () => void;
  onStateChange: (state: { isDirty: boolean; isPending: boolean }) => void;
  certTemplate?: TCertificateTemplateV2;
  handlePopUpToggle: (state?: boolean) => void;
};

export const PkiTemplateForm = ({
  certTemplate,
  handlePopUpToggle,
  onCancel,
  onStateChange
}: Props) => {
  const { currentProject } = useProject();

  const { data: cas, isPending: isCaLoading } = useListCasByProjectId();

  const { mutateAsync: createCertTemplate } = useCreateCertTemplateV2();
  const { mutateAsync: updateCertTemplate } = useUpdateCertTemplateV2();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: async () => {
      if (certTemplate) {
        return {
          ca: certTemplate.ca,
          name: certTemplate.name,
          commonName: certTemplate.commonName,
          subjectAlternativeName: certTemplate.subjectAlternativeName,
          ttl: certTemplate.ttl,
          keyUsages: Object.fromEntries(certTemplate.keyUsages.map((name) => [name, true]) ?? []),
          extendedKeyUsages: Object.fromEntries(
            certTemplate.extendedKeyUsages.map((name) => [name, true]) ?? []
          )
        };
      }
      return {
        ca: { name: "", id: "" },
        name: "",
        subjectAlternativeName: "",
        commonName: "",
        ttl: "",
        keyUsages: {
          [CertKeyUsage.DIGITAL_SIGNATURE]: true,
          [CertKeyUsage.KEY_ENCIPHERMENT]: true
        },
        extendedKeyUsages: {}
      };
    }
  });

  useEffect(() => {
    onStateChange({ isDirty, isPending: isSubmitting });
  }, [isDirty, isSubmitting, onStateChange]);

  const onFormSubmit = async ({
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    keyUsages,
    extendedKeyUsages,
    ca
  }: FormData) => {
    if (!currentProject?.id) {
      return;
    }

    if (certTemplate) {
      await updateCertTemplate({
        templateName: certTemplate.name,
        caName: ca.name,
        name,
        commonName,
        subjectAlternativeName,
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

      createNotification({
        text: "Successfully updated certificate template",
        type: "success"
      });
    } else {
      await createCertTemplate({
        caName: ca.name,
        name,
        commonName,
        subjectAlternativeName,
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

      createNotification({
        text: "Successfully created certificate template",
        type: "success"
      });
    }

    reset();
    handlePopUpToggle(false);
  };

  const { creation: caCreation, caCreationModals } = useCaCreation<{ id: string; name: string }>(
    (ca) => {
      setValue("ca", { id: ca.id, name: ca.name }, { shouldDirty: true, shouldValidate: true });
    }
  );

  return (
    <>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onFormSubmit)}>
        <fieldset
          disabled={isSubmitting}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
          {certTemplate && (
            <Field>
              <FieldLabel htmlFor="pki-template-id">Certificate Template ID</FieldLabel>
              <Input id="pki-template-id" value={certTemplate.id} disabled />
            </Field>
          )}
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="pki-template-name">
                  Template Name <span className="text-danger">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="pki-template-name"
                    placeholder="my-template"
                    autoComplete="off"
                    name="pki-template-name"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            render={({ field: { value, onChange, onBlur, name, ref }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="pki-template-ca">
                  Issuing CA <span className="text-danger">*</span>
                </FieldLabel>
                <FieldContent>
                  <Combobox
                    ref={ref}
                    onBlur={onBlur}
                    name={name}
                    isError={Boolean(error)}
                    id="pki-template-ca"
                    options={cas || []}
                    isLoading={isCaLoading}
                    isClearable={false}
                    placeholder="Select CA..."
                    onValueChange={onChange}
                    value={value?.id ? value : null}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => option.name}
                    creation={caCreation}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
            control={control}
            name="ca"
          />
          <Controller
            control={control}
            defaultValue=""
            name="commonName"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="pki-template-common-name">
                  Common Name (CN) <span className="text-danger">*</span>
                  <Tooltip hoverable delayDuration={50}>
                    <TooltipTrigger asChild>
                      <CircleHelpIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-center">
                      This field accepts limited regular expressions: spaces, *, ., @, -, \ (for
                      escaping), and alphanumeric characters only
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="pki-template-common-name"
                    placeholder=".*\.acme.com"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="subjectAlternativeName"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="pki-template-san">
                  Alternative Names (SAN) <span className="text-danger">*</span>
                  <Tooltip hoverable delayDuration={50}>
                    <TooltipTrigger asChild>
                      <CircleHelpIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-center">
                      This field accepts limited regular expressions: spaces, *, ., @, -, \ (for
                      escaping), and alphanumeric characters only
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="pki-template-san"
                    placeholder="service\.acme.\..*"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="pki-template-ttl">
                  Max TTL <span className="text-danger">*</span>
                </FieldLabel>
                <FieldContent>
                  <Input
                    {...field}
                    id="pki-template-ttl"
                    placeholder="2 days, 1d, 2h, 1y, ..."
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Accordion type="single" collapsible variant="ghost" className="w-full">
            <AccordionItem value="key-usages" className="border-b-0">
              <AccordionTrigger>Key Usage</AccordionTrigger>
              <AccordionContent>
                <Controller
                  control={control}
                  name="keyUsages"
                  render={({ field: { onChange, value }, fieldState: { error } }) => {
                    return (
                      <Field className="mb-7">
                        <FieldLabel>Key Usage</FieldLabel>
                        <FieldContent>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => {
                              return (
                                <div key={optionValue} className="flex items-center gap-3">
                                  <Checkbox
                                    id={`key-usage-${optionValue}`}
                                    variant="project"
                                    isChecked={value[optionValue]}
                                    onCheckedChange={(state) => {
                                      onChange({
                                        ...value,
                                        [optionValue]: state
                                      });
                                    }}
                                  />
                                  <label
                                    htmlFor={`key-usage-${optionValue}`}
                                    className="cursor-pointer text-sm text-foreground"
                                  >
                                    {label}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    );
                  }}
                />
                <Controller
                  control={control}
                  name="extendedKeyUsages"
                  render={({ field: { onChange, value }, fieldState: { error } }) => {
                    return (
                      <Field className="mb-7">
                        <FieldLabel>Extended Key Usage</FieldLabel>
                        <FieldContent>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {EXTENDED_KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => {
                              return (
                                <div key={optionValue} className="flex items-center gap-3">
                                  <Checkbox
                                    id={`extended-key-usage-${optionValue}`}
                                    variant="project"
                                    isChecked={value[optionValue]}
                                    onCheckedChange={(state) => {
                                      onChange({
                                        ...value,
                                        [optionValue]: state
                                      });
                                    }}
                                  />
                                  <label
                                    htmlFor={`extended-key-usage-${optionValue}`}
                                    className="cursor-pointer text-sm text-foreground"
                                  >
                                    {label}
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                          <FieldError errors={[error]} />
                        </FieldContent>
                      </Field>
                    );
                  }}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </fieldset>
        <SheetFooter className="justify-end border-t">
          <Button variant="ghost" isDisabled={isSubmitting} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="project"
            type="submit"
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            Save
          </Button>
        </SheetFooter>
      </form>
      {caCreationModals}
    </>
  );
};
