import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch,
  TextArea
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useCreateEstConfig, useGetEstConfig, useUpdateEstConfig } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum EnrollmentMethod {
  EST = "est"
}

type Props = {
  popUp: UsePopUpState<["enrollmentOptions"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["enrollmentOptions"]>,
    state?: boolean
  ) => void;
};

const schema = z.object({
  method: z.nativeEnum(EnrollmentMethod),
  caChain: z.string().optional(),
  passphrase: z.string().optional(),
  isEnabled: z.boolean(),
  disableBootstrapCertValidation: z.boolean().optional().default(false)
});

export type FormData = z.infer<typeof schema>;

export const CertificateTemplateEnrollmentModal = ({ popUp, handlePopUpToggle }: Props) => {
  const popUpData = popUp?.enrollmentOptions?.data as {
    id: string;
  };
  const certificateTemplateId = popUpData?.id;

  const { data } = useGetEstConfig(certificateTemplateId);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const { mutateAsync: createEstConfig } = useCreateEstConfig();
  const { mutateAsync: updateEstConfig } = useUpdateEstConfig();
  const [isPassphraseFocused, setIsPassphraseFocused] = useToggle(false);

  const disableBootstrapCertValidation = watch("disableBootstrapCertValidation");

  useEffect(() => {
    if (disableBootstrapCertValidation) {
      setValue("caChain", "");
    }
  }, [disableBootstrapCertValidation]);

  useEffect(() => {
    if (data) {
      reset({
        caChain: data.caChain,
        isEnabled: data.isEnabled,
        disableBootstrapCertValidation: data.disableBootstrapCertValidation
      });
    } else {
      reset({
        caChain: "",
        isEnabled: false,
        disableBootstrapCertValidation: false
      });
    }
  }, [data]);

  const onFormSubmit = async ({ caChain, passphrase, isEnabled }: FormData) => {
    try {
      if (data) {
        await updateEstConfig({
          certificateTemplateId,
          caChain,
          passphrase,
          isEnabled,
          disableBootstrapCertValidation
        });
      } else {
        if (!passphrase) {
          setError("passphrase", { message: "Passphrase is required to setup EST" });
          return;
        }

        await createEstConfig({
          certificateTemplateId,
          caChain,
          passphrase,
          isEnabled,
          disableBootstrapCertValidation
        });
      }

      handlePopUpToggle("enrollmentOptions", false);

      createNotification({
        text: "Successfully saved changes",
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Modal
      isOpen={popUp?.enrollmentOptions?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("enrollmentOptions", isOpen);
        reset();
      }}
    >
      <ModalContent title="Manage Enrollment Options">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="method"
            defaultValue={EnrollmentMethod.EST}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Client Enrollment Method"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  <SelectItem value={EnrollmentMethod.EST} key={EnrollmentMethod.EST}>
                    EST
                  </SelectItem>
                </Select>
              </FormControl>
            )}
          />
          {data && (
            <FormControl label="EST Label">
              <Input value={data.certificateTemplateId} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            name="disableBootstrapCertValidation"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl isError={Boolean(error)} errorText={error?.message}>
                  <Switch
                    id="skip-bootstrap-cert-validation"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="ml-1 w-full">Disable Bootstrap Certificate Validation</p>
                  </Switch>
                </FormControl>
              );
            }}
          />
          {!disableBootstrapCertValidation && (
            <Controller
              control={control}
              name="caChain"
              disabled={disableBootstrapCertValidation}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Certificate Authority Chain"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  isRequired={!disableBootstrapCertValidation}
                >
                  <TextArea
                    {...field}
                    isDisabled={disableBootstrapCertValidation}
                    className="min-h-[15rem] border-none bg-mineshaft-900 text-gray-400"
                    reSize="none"
                  />
                </FormControl>
              )}
            />
          )}
          <Controller
            control={control}
            name="passphrase"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Passphrase" isError={Boolean(error)} errorText={error?.message}>
                <Input
                  {...field}
                  type={isPassphraseFocused ? "text" : "password"}
                  onFocus={() => setIsPassphraseFocused.on()}
                  onBlur={() => setIsPassphraseFocused.off()}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="isEnabled"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl isError={Boolean(error)} errorText={error?.message}>
                  <Switch
                    id="is-active"
                    onCheckedChange={(value) => field.onChange(value)}
                    isChecked={field.value}
                  >
                    <p className="ml-1 w-full">EST Enabled</p>
                  </Switch>
                </FormControl>
              );
            }}
          />

          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Save
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("enrollmentOptions", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
