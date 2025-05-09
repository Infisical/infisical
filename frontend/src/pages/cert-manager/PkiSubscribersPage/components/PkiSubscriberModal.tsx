import { useEffect } from "react";
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
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  CaStatus,
  useCreatePkiSubscriber,
  useGetPkiSubscriber,
  useListWorkspaceCas,
  useListWorkspacePkiSubscribers,
  useUpdatePkiSubscriber
} from "@app/hooks/api";
import {
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertExtendedKeyUsage, CertKeyUsage } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["pkiSubscriber"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["pkiSubscriber"]>, state?: boolean) => void;
};

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    caId: z.string().min(1, "Issuing CA is required"),
    commonName: z.string().trim().min(1, "Common Name is required"),
    subjectAlternativeNames: z.string(),
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
      [CertExtendedKeyUsage.CLIENT_AUTH]: z.boolean().optional(),
      [CertExtendedKeyUsage.CODE_SIGNING]: z.boolean().optional(),
      [CertExtendedKeyUsage.EMAIL_PROTECTION]: z.boolean().optional(),
      [CertExtendedKeyUsage.OCSP_SIGNING]: z.boolean().optional(),
      [CertExtendedKeyUsage.SERVER_AUTH]: z.boolean().optional(),
      [CertExtendedKeyUsage.TIMESTAMPING]: z.boolean().optional()
    })
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const PkiSubscriberModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace.id;
  const { data: subscribers } = useListWorkspacePkiSubscribers(projectId);
  const { data: cas } = useListWorkspaceCas({
    projectSlug: currentWorkspace?.slug ?? "",
    status: CaStatus.ACTIVE
  });

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
      extendedKeyUsages: {}
    }
  });

  useEffect(() => {
    if (pkiSubscriber) {
      reset({
        name: pkiSubscriber.name,
        caId: pkiSubscriber.caId || "",
        commonName: pkiSubscriber.commonName,
        subjectAlternativeNames: pkiSubscriber.subjectAlternativeNames.join(", ") || "",
        ttl: pkiSubscriber.ttl || "",
        keyUsages: Object.fromEntries((pkiSubscriber.keyUsages || []).map((name) => [name, true])),
        extendedKeyUsages: Object.fromEntries(
          (pkiSubscriber.extendedKeyUsages || []).map((name) => [name, true])
        )
      });
    } else {
      reset({
        name: "",
        caId: "",
        commonName: "",
        subjectAlternativeNames: "",
        ttl: "",
        keyUsages: {
          [CertKeyUsage.DIGITAL_SIGNATURE]: true,
          [CertKeyUsage.KEY_ENCIPHERMENT]: true
        },
        extendedKeyUsages: {}
      });
    }
  }, [pkiSubscriber, reset]);

  useEffect(() => {
    if (cas?.length) {
      setValue("caId", cas[0].id);
    }
  }, [cas, setValue]);

  const onFormSubmit = async ({
    name,
    caId,
    commonName,
    subjectAlternativeNames,
    ttl,
    keyUsages,
    extendedKeyUsages
  }: FormData) => {
    try {
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

      const keyUsagesList = Object.entries(keyUsages)
        .filter(([, value]) => value)
        .map(([key]) => key as CertKeyUsage);

      const extendedKeyUsagesList = Object.entries(extendedKeyUsages)
        .filter(([, value]) => value)
        .map(([key]) => key as CertExtendedKeyUsage);

      const subjectAlternativeNamesList = subjectAlternativeNames
        .split(",")
        .map((san) => san.trim())
        .filter(Boolean);

      if (pkiSubscriber) {
        await updateMutateAsync({
          subscriberName: pkiSubscriber.name,
          projectId,
          name,
          caId,
          commonName,
          subjectAlternativeNames: subjectAlternativeNamesList,
          ttl,
          keyUsages: keyUsagesList,
          extendedKeyUsages: extendedKeyUsagesList
        });
      } else {
        await createMutateAsync({
          projectId,
          name,
          caId,
          commonName,
          subjectAlternativeNames: subjectAlternativeNamesList,
          ttl,
          keyUsages: keyUsagesList,
          extendedKeyUsages: extendedKeyUsagesList
        });
      }

      reset();
      handlePopUpToggle("pkiSubscriber", false);

      createNotification({
        text: `Successfully ${pkiSubscriber ? "updated" : "added"} PKI subscriber`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${pkiSubscriber ? "update" : "add"} PKI subscriber`,
        type: "error"
      });
    }
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
        <form onSubmit={handleSubmit(onFormSubmit)}>
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
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {(cas || []).map(({ id, dn }) => (
                    <SelectItem value={id} key={`ca-${id}`}>
                      {dn}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
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
                                className="data-[state=checked]:bg-primary"
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
                                className="data-[state=checked]:bg-primary"
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
