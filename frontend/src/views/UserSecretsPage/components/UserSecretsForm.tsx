import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input } from "@app/components/v2";
import { useCreateUserSecret } from "@app/hooks/api/userSecrets";
import { createNotification } from "@app/components/notifications";

const schema = z.object({
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

type Props = {
  value?: string;
};

export const UserSecretsForm = ({ value }: Props) => {
  const createUserSecret = useCreateUserSecret();

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      content: value || ""
    }
  });

  const onFormSubmit = async ({
    title,
    content,
    username,
    password,
    cardNumber,
    expiryDate,
    cvv
  }: FormData) => {
    try {
      await createUserSecret.mutateAsync({
        title,
        content,
        username,
        password,
        cardNumber,
        expiryDate,
        cvv
      });

      reset();
      createNotification({
        text: "Successfully created user secret.",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a user secret.",
        type: "error"
      });
    }
  };

  return (
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
        Create User Secret
      </Button>
    </form>
  );
};
