import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useUpdateUserSecret } from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

type Props = {
  popUp: UsePopUpState<["updateUserSecrets"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["updateUserSecrets"]>,
    state?: boolean
  ) => void;
};

const schema = z.object({
  userSecretId: z.string(),

  // Secure Note
  title: z.string().optional(),
  content: z.string().optional(),

  // Web Login
  username: z.string().optional(),
  password: z.string().optional(),

  // Credit Card
  cardNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  cvv: z.string().optional(),
});

export type FormData = z.infer<typeof schema>;

export const UpdateUserSecretsModal = ({ popUp, handlePopUpToggle }: Props) => {
  const updateUserSecrets = useUpdateUserSecret();
  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: popUp.updateUserSecrets.data as FormData 
  });

  const onFormSubmit = async (formData: FormData) => {
    try {
      console.log({ formData });
      await updateUserSecrets.mutateAsync(formData);

      createNotification({
        text: "Successfully updated environment",
        type: "success"
      });

      reset();
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update environment",
        type: "error"
      });
    }
  };
  return (
    <Modal
      isOpen={popUp?.updateUserSecrets?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("updateUserSecrets", isOpen);
      }}
    >
      <ModalContent
        title="Update a User Secret"
        subTitle="This will only be available to you"
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {/* Secure Note */}
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Title"
                isError={Boolean(error)}
                errorText={error?.message}
                isOptional
              >
                <Input {...field} placeholder="Title" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="content"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Content"
                isError={Boolean(error)}
                errorText={error?.message}
                className="mb-2"
                isOptional
              >
                <textarea
                  placeholder="Enter sensitive data to share via an encrypted link..."
                  {...field}
                  className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 py-1.5 px-2 text-bunker-300 outline-none transition-all placeholder:text-mineshaft-400 hover:border-primary-400/30 focus:border-primary-400/50 group-hover:mr-2"
                />
              </FormControl>
            )}
          />

          {/* Web Login */} 
          <Controller
            control={control}
            name="username"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Username"
                isError={Boolean(error)}
                errorText={error?.message}
                isOptional
              >
                <Input {...field} placeholder="Username" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Password"
                isError={Boolean(error)}
                errorText={error?.message}
                isOptional
              >
                <Input {...field} placeholder="Password" type="password" />
              </FormControl>
            )}
          />

          {/* Credit Card */} 
          <Controller
            control={control}
            name="cardNumber"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Card Number"
                isError={Boolean(error)}
                errorText={error?.message}
                isOptional
              >
                <Input {...field} placeholder="Card number" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="expiryDate"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Expiry Date"
                isError={Boolean(error)}
                errorText={error?.message}
                isOptional
              >
                <Input {...field} placeholder="Expiry Date" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="cvv"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="CVV"
                isError={Boolean(error)}
                errorText={error?.message}
                isOptional
              >
                <Input {...field} placeholder="CVV" type="text" />
              </FormControl>
            )}
          />

          <Button
            className="mt-4"
            size="sm"
            type="submit"
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            Update User Secret
          </Button>
        </form>
      </ModalContent>
    </Modal>
  );
};
