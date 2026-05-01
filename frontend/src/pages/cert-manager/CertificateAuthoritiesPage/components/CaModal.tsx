import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tooltip
  // DatePicker
} from "@app/components/v2";
import { useProject } from "@app/context";
import {
  CaStatus,
  CaType,
  InternalCaType,
  MAX_DISTRIBUTION_POINT_URL_LENGTH,
  MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS,
  useCreateCa,
  useGetCa,
  useUpdateCa
} from "@app/hooks/api/ca";
import { certKeyAlgorithms } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const getDateTenYearsFromToday = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 10);
  return format(date, "yyyy-MM-dd");
};

const distributionPointUrlEntrySchema = z.object({
  value: z
    .string()
    .trim()
    .max(MAX_DISTRIBUTION_POINT_URL_LENGTH, "URL is too long")
    .url("Must be a valid URL")
    .refine((url) => /^https?:\/\//i.test(url), { message: "URL must use http:// or https://" })
});

const distributionPointUrlsSchema = z
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
  });

const schema = z
  .object({
    type: z.nativeEnum(CaType),
    name: slugSchema({
      field: "Name"
    }),
    status: z.nativeEnum(CaStatus),
    configuration: z
      .object({
        type: z.enum([InternalCaType.ROOT, InternalCaType.INTERMEDIATE]),
        organization: z.string(),
        ou: z.string(),
        country: z.string(),
        province: z.string(),
        locality: z.string(),
        commonName: z.string(),
        notAfter: z.string().trim().refine(isValidDate, { message: "Invalid date format" }),
        maxPathLength: z.string(),
        keyAlgorithm: z.nativeEnum(CertKeyAlgorithm),
        crlDistributionPointUrls: distributionPointUrlsSchema.default([])
      })
      .required()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["ca"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["ca"]>, state?: boolean) => void;
};

const caTypes = [
  { label: "Root", value: InternalCaType.ROOT },
  { label: "Intermediate", value: InternalCaType.INTERMEDIATE }
];

export const CaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { data: ca } = useGetCa({
    caId: (popUp?.ca?.data as { caId: string })?.caId || "",
    type: CaType.INTERNAL
  });

  const { mutateAsync: createMutateAsync } = useCreateCa();
  const { mutateAsync: updateMutateAsync } = useUpdateCa();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: CaType.INTERNAL,
      name: "",
      status: CaStatus.ACTIVE,
      configuration: {
        type: InternalCaType.ROOT,
        organization: "",
        ou: "",
        country: "",
        province: "",
        locality: "",
        commonName: "",
        notAfter: getDateTenYearsFromToday(),
        maxPathLength: "-1",
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        crlDistributionPointUrls: []
      }
    }
  });

  const caType = watch("configuration.type");

  const crlUrlsFieldArray = useFieldArray({
    control,
    name: "configuration.crlDistributionPointUrls"
  });

  useEffect(() => {
    if (ca && ca.type === CaType.INTERNAL) {
      reset({
        type: ca.type,
        name: ca.name,
        status: ca.status,
        configuration: {
          type: ca.configuration.type,
          organization: ca.configuration.organization,
          ou: ca.configuration.ou,
          country: ca.configuration.country,
          province: ca.configuration.province,
          locality: ca.configuration.locality,
          commonName: ca.configuration.commonName,
          notAfter: ca.configuration.notAfter
            ? format(new Date(ca.configuration.notAfter), "yyyy-MM-dd")
            : "",
          maxPathLength: ca.configuration.maxPathLength
            ? String(ca.configuration.maxPathLength)
            : "",
          keyAlgorithm: Object.values(CertKeyAlgorithm).includes(
            ca.configuration.keyAlgorithm as CertKeyAlgorithm
          )
            ? ca.configuration.keyAlgorithm
            : CertKeyAlgorithm.RSA_2048,
          crlDistributionPointUrls: (ca.configuration.crlDistributionPointUrls ?? []).map(
            (value) => ({ value })
          )
        }
      });
    } else {
      reset({
        type: CaType.INTERNAL,
        name: "",
        status: CaStatus.ACTIVE,
        configuration: {
          type: InternalCaType.ROOT,
          organization: "",
          ou: "",
          country: "",
          province: "",
          locality: "",
          commonName: "",
          notAfter: getDateTenYearsFromToday(),
          maxPathLength: "-1",
          keyAlgorithm: CertKeyAlgorithm.RSA_2048,
          crlDistributionPointUrls: []
        }
      });
    }
  }, [ca]);

  const onFormSubmit = async ({ type, name, status, configuration }: FormData) => {
    if (!currentProject?.slug) return;

    if (ca) {
      // update
      await updateMutateAsync({
        id: ca.id,
        name,
        type: CaType.INTERNAL,
        status
      });
    } else {
      // create
      await createMutateAsync({
        projectId: currentProject.id,
        name,
        type,
        status,
        configuration: {
          ...configuration,
          maxPathLength: Number(configuration.maxPathLength),
          crlDistributionPointUrls: configuration.crlDistributionPointUrls.map(({ value }) => value)
        }
      });
    }

    reset();
    handlePopUpToggle("ca", false);

    createNotification({
      text: `Successfully ${ca ? "updated" : "created"} CA`,
      type: "success"
    });
  };

  return (
    <Modal
      isOpen={popUp?.ca?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("ca", isOpen);
      }}
    >
      <ModalContent title={`${ca ? "View" : "Create"} Private CA`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {ca && (
            <FormControl label="CA ID">
              <Input value={ca.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            name="configuration.type"
            defaultValue={InternalCaType.ROOT}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="CA Type" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                  isDisabled={Boolean(ca)}
                >
                  {caTypes.map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          {caType === InternalCaType.ROOT && (
            <>
              {/* <Controller
                name="notAfter"
                control={control}
                defaultValue={getDefaultNotAfterDate()}
                render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                  return (
                    <FormControl
                      label="Validity"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="mr-4"
                    >
                      <DatePicker
                        value={field.value || undefined}
                        onChange={(date) => {
                          onChange(date);
                          setIsStartDatePickerOpen(false);
                        }}
                        popUpProps={{
                          open: isStartDatePickerOpen,
                          onOpenChange: setIsStartDatePickerOpen
                        }}
                        popUpContentProps={{}}
                      />
                    </FormControl>
                  );
                }}
              /> */}
              <Controller
                control={control}
                defaultValue=""
                name="configuration.notAfter"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Valid Until"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    isRequired
                  >
                    <Input {...field} placeholder="YYYY-MM-DD" isDisabled={Boolean(ca)} />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="configuration.maxPathLength"
                defaultValue="-1"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Path Length"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    className="mt-4"
                  >
                    <Select
                      defaultValue={field.value}
                      {...field}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                      isDisabled={Boolean(ca)}
                    >
                      {[-1, 0, 1, 2, 3, 4].map((value) => (
                        <SelectItem value={String(value)} key={`ca-path-length-${value}`}>
                          {`${value}`}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </>
          )}
          <Controller
            control={control}
            name="configuration.keyAlgorithm"
            defaultValue={CertKeyAlgorithm.RSA_2048}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Key Algorithm"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                  isDisabled={Boolean(ca)}
                >
                  {certKeyAlgorithms.map(({ label, value }) => (
                    <SelectItem value={String(value || "")} key={label}>
                      {label}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="my-internal-ca" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="configuration.organization"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Organization (O)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Acme Corp" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="configuration.ou"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Organization Unit (OU)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Engineering" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="configuration.country"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Country Name (C)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="United States (US)" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="configuration.province"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="State or Province Name"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="California" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="configuration.locality"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Locality Name"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="San Francisco" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="configuration.commonName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Common Name (CN)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Example CA" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          {!ca && (
            <FormControl
              label="CRL Distribution Points"
              helperText={`Backup CRL URLs embedded in issued certificates. Up to ${MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS}.`}
            >
              <div className="flex flex-col gap-2">
                {crlUrlsFieldArray.fields.map((field, index) => (
                  <Controller
                    key={field.id}
                    control={control}
                    name={`configuration.crlDistributionPointUrls.${index}.value`}
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
                          <IconButton
                            ariaLabel="Remove URL"
                            colorSchema="danger"
                            variant="plain"
                            size="sm"
                            className="mt-1.5"
                            onClick={() => crlUrlsFieldArray.remove(index)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    )}
                  />
                ))}
                <Button
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  size="xs"
                  variant="outline_bg"
                  isDisabled={
                    crlUrlsFieldArray.fields.length >= MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS
                  }
                  onClick={() => crlUrlsFieldArray.append({ value: "" })}
                >
                  Add URL
                </Button>
              </div>
            </FormControl>
          )}
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {popUp?.ca?.data ? "Update" : "Create"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("ca", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
