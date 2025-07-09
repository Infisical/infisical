import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  FilterableSelect,
  FormControl,
  FormLabel,
  Input,
  Tooltip
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreateCertTemplateV2,
  useListCasByProjectId,
  useUpdateCertTemplateV2
} from "@app/hooks/api";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { TCertificateTemplateV2 } from "@app/hooks/api/certificateTemplates/types";
import { slugSchema } from "@app/lib/schemas";

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
    [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
    [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
    [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
    [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
    [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
    [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
  })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  certTemplate?: TCertificateTemplateV2;
  handlePopUpToggle: (state?: boolean) => void;
};

export const PkiTemplateForm = ({ certTemplate, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();

  const { data: cas, isPending: isCaLoading } = useListCasByProjectId(currentWorkspace.id);

  const { mutateAsync: createCertTemplate } = useCreateCertTemplateV2();
  const { mutateAsync: updateCertTemplate } = useUpdateCertTemplateV2();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
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

  const onFormSubmit = async ({
    name,
    commonName,
    subjectAlternativeName,
    ttl,
    keyUsages,
    extendedKeyUsages,
    ca
  }: FormData) => {
    if (!currentWorkspace?.id) {
      return;
    }

    try {
      if (certTemplate) {
        await updateCertTemplate({
          templateName: certTemplate.name,
          projectId: currentWorkspace.id,
          caName: ca.name,
          name,
          commonName,
          subjectAlternativeName,
          ttl,
          keyUsages: Object.entries(keyUsages)
            .filter(([, value]) => value)
            .map(([key]) => key as CertKeyUsage),
          extendedKeyUsages: Object.entries(extendedKeyUsages)
            .filter(([, value]) => value)
            .map(([key]) => key as CertExtendedKeyUsage)
        });

        createNotification({
          text: "Successfully updated certificate template",
          type: "success"
        });
      } else {
        await createCertTemplate({
          projectId: currentWorkspace.id,
          caName: ca.name,
          name,
          commonName,
          subjectAlternativeName,
          ttl,
          keyUsages: Object.entries(keyUsages)
            .filter(([, value]) => value)
            .map(([key]) => key as CertKeyUsage),
          extendedKeyUsages: Object.entries(extendedKeyUsages)
            .filter(([, value]) => value)
            .map(([key]) => key as CertExtendedKeyUsage)
        });

        createNotification({
          text: "Successfully created certificate template",
          type: "success"
        });
      }

      reset();
      handlePopUpToggle(false);
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to save changes",
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      {certTemplate && (
        <FormControl label="Certificate Template ID">
          <Input value={certTemplate.id} isDisabled className="bg-white/[0.07]" />
        </FormControl>
      )}
      <Controller
        control={control}
        defaultValue=""
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Template Name"
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
          >
            <Input {...field} placeholder="my-template" />
          </FormControl>
        )}
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            label="Issuing CA"
            errorText={error?.message}
            isError={Boolean(error)}
            isRequired
          >
            <FilterableSelect
              options={cas || []}
              isLoading={isCaLoading}
              placeholder="Select CA..."
              onChange={onChange}
              value={value}
              getOptionValue={(option) => option.id}
              getOptionLabel={(option) => option.name}
            />
          </FormControl>
        )}
        control={control}
        name="ca"
      />
      <Controller
        control={control}
        defaultValue=""
        name="commonName"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label={
              <div>
                <FormLabel
                  isRequired
                  label="Common Name (CN)"
                  icon={
                    <Tooltip
                      className="text-center"
                      content={
                        <span>
                          This field accepts limited regular expressions: spaces, *, ., @, -, \ (for
                          escaping), and alphanumeric characters only
                        </span>
                      }
                    >
                      <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                    </Tooltip>
                  }
                />
              </div>
            }
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
          >
            <Input {...field} placeholder=".*\.acme.com" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        defaultValue=""
        name="subjectAlternativeName"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label={
              <div>
                <FormLabel
                  isRequired
                  label="Alternative Names (SAN)"
                  icon={
                    <Tooltip
                      className="text-center"
                      content={
                        <span>
                          This field accepts limited regular expressions: spaces, *, ., @, -, \ (for
                          escaping), and alphanumeric characters only
                        </span>
                      }
                    >
                      <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                    </Tooltip>
                  }
                />
              </div>
            }
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
          >
            <Input {...field} placeholder="service\.acme.\..*" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="ttl"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Max TTL"
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
          >
            <Input {...field} placeholder="2 days, 1d, 2h, 1y, ..." />
          </FormControl>
        )}
      />
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
                    <div className="mb-7 mt-2 grid grid-cols-2 gap-2">
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
                    <div className="mb-7 mt-2 grid grid-cols-2 gap-2">
                      {EXTENDED_KEY_USAGES_OPTIONS.map(({ label, value: optionValue }) => {
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
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="mt-4 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Save
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={() => handlePopUpToggle(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
