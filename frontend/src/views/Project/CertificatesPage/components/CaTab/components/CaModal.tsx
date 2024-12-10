import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch
  // DatePicker
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { CaType, useCreateCa, useGetCaById, useUpdateCa } from "@app/hooks/api/ca";
import { certKeyAlgorithms } from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { UsePopUpState } from "@app/hooks/usePopUp";

const isValidDate = (dateString: string) => {
  const date = new Date(dateString);
  return !Number.isNaN(date.getTime());
};

const getDateTenYearsFromToday = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 10);
  return format(date, "yyyy-MM-dd");
};

const schema = z
  .object({
    type: z.enum([CaType.ROOT, CaType.INTERMEDIATE]),
    friendlyName: z.string(),
    organization: z.string(),
    ou: z.string(),
    country: z.string(),
    province: z.string(),
    locality: z.string(),
    commonName: z.string(),
    notAfter: z.string().trim().refine(isValidDate, { message: "Invalid date format" }),
    maxPathLength: z.string(),
    keyAlgorithm: z.enum([
      CertKeyAlgorithm.RSA_2048,
      CertKeyAlgorithm.RSA_4096,
      CertKeyAlgorithm.ECDSA_P256,
      CertKeyAlgorithm.ECDSA_P384
    ]),
    requireTemplateForIssuance: z.boolean()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["ca"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["ca"]>, state?: boolean) => void;
};

const caTypes = [
  { label: "Root", value: CaType.ROOT },
  { label: "Intermediate", value: CaType.INTERMEDIATE }
];

export const CaModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  // const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);

  const { data: ca } = useGetCaById((popUp?.ca?.data as { caId: string })?.caId || "");

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
      type: CaType.ROOT,
      friendlyName: "",
      organization: "",
      ou: "",
      country: "",
      province: "",
      locality: "",
      commonName: "",
      notAfter: getDateTenYearsFromToday(),
      maxPathLength: "-1",
      keyAlgorithm: CertKeyAlgorithm.RSA_2048
    }
  });

  const caType = watch("type");

  useEffect(() => {
    if (ca) {
      reset({
        type: ca.type,
        friendlyName: ca.friendlyName,
        organization: ca.organization,
        ou: ca.ou,
        country: ca.country,
        province: ca.province,
        locality: ca.locality,
        commonName: ca.commonName,
        notAfter: ca.notAfter ? format(new Date(ca.notAfter), "yyyy-MM-dd") : "",
        maxPathLength: ca.maxPathLength ? String(ca.maxPathLength) : "",
        keyAlgorithm: ca.keyAlgorithm,
        requireTemplateForIssuance: ca.requireTemplateForIssuance
      });
    } else {
      reset({
        type: CaType.ROOT,
        friendlyName: "",
        organization: "",
        ou: "",
        country: "",
        province: "",
        locality: "",
        commonName: "",
        notAfter: getDateTenYearsFromToday(),
        maxPathLength: "-1",
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        requireTemplateForIssuance: true
      });
    }
  }, [ca]);

  const onFormSubmit = async ({
    type,
    friendlyName,
    commonName,
    organization,
    ou,
    country,
    locality,
    province,
    notAfter,
    maxPathLength,
    keyAlgorithm,
    requireTemplateForIssuance
  }: FormData) => {
    try {
      if (!currentWorkspace?.slug) return;

      if (ca) {
        // update
        await updateMutateAsync({
          projectSlug: currentWorkspace.slug,
          caId: ca.id,
          requireTemplateForIssuance
        });
      } else {
        // create
        await createMutateAsync({
          projectSlug: currentWorkspace.slug,
          type,
          friendlyName,
          commonName,
          organization,
          ou,
          country,
          province,
          locality,
          notAfter,
          maxPathLength: Number(maxPathLength),
          keyAlgorithm,
          requireTemplateForIssuance
        });
      }

      reset();
      handlePopUpToggle("ca", false);

      createNotification({
        text: `Successfully ${ca ? "updated" : "created"} CA`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create CA",
        type: "error"
      });
    }
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
            name="type"
            defaultValue={CaType.ROOT}
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
          {caType === CaType.ROOT && (
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
                name="notAfter"
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
                name="maxPathLength"
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
            name="keyAlgorithm"
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
            name="friendlyName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Friendly Name"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="My CA" isDisabled={Boolean(ca)} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="organization"
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
            name="ou"
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
            name="country"
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
            name="province"
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
            name="locality"
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
            name="commonName"
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
          <Controller
            control={control}
            name="requireTemplateForIssuance"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl isError={Boolean(error)} errorText={error?.message} className="my-8">
                  <Switch
                    id="is-active"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="w-full">Require Template for Certificate Issuance</p>
                  </Switch>
                </FormControl>
              );
            }}
          />
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
