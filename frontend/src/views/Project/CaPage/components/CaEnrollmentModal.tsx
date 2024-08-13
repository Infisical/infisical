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

const schema = z
  .object({
    method: z.nativeEnum(EnrollmentMethod),
    caChain: z.string(),
    passphrase: z.string(),
    isEnabled: z.boolean()
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const CaEnrollmentModal = ({ popUp, handlePopUpToggle }: Props) => {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      isEnabled: false
    }
  });

  const onFormSubmit = async ({ caChain, passphrase, isEnabled }: FormData) => {
    try {
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
            defaultValue=""
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
            defaultValue=""
            name="passphrase"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Passphrase"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
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
