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
import { useCreateCaEstConfig, useGetCaEstConfig, useUpdateCaEstConfig } from "@app/hooks/api";
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
  caChain: z.string(),
  passphrase: z.string().optional(),
  isEnabled: z.boolean()
});

export type FormData = z.infer<typeof schema>;

export const CaEnrollmentModal = ({ popUp, handlePopUpToggle }: Props) => {
  const popUpData = popUp?.enrollmentOptions?.data as {
    caId: string;
  };
  const caId = popUpData?.caId;

  const { data } = useGetCaEstConfig(caId);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const { mutateAsync: createCaEstConfig } = useCreateCaEstConfig();
  const { mutateAsync: updateCaEstConfig } = useUpdateCaEstConfig();

  useEffect(() => {
    if (data) {
      reset({
        caChain: data.caChain,
        isEnabled: data.isEnabled
      });
    } else {
      reset({
        caChain: "",
        isEnabled: false
      });
    }
  }, [data]);

  const onFormSubmit = async ({ caChain, passphrase, isEnabled }: FormData) => {
    try {
      if (data) {
        await updateCaEstConfig({
          caId,
          caChain,
          passphrase,
          isEnabled
        });
      } else {
        if (!passphrase) {
          setError("passphrase", { message: "Passphrase is required to setup EST enrollment." });
          return;
        }

        await createCaEstConfig({
          caId,
          caChain,
          passphrase,
          isEnabled
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
          <Controller
            control={control}
            name="caChain"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Certificate Authority Chain"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <TextArea {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="passphrase"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Passphrase" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} type="password" />
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
                    <p className="ml-1 w-full">Enabled</p>
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