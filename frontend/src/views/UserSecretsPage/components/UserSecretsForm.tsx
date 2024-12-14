import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input } from "@app/components/v2";
/**
import { createNotification } from "@app/components/notifications";
import { useCreateSharedSecret } from "@app/hooks/api";
**/


// TODO: update schema
const schema = z.object({
  // Secure Note
  title: z.string().optional(),
  content: z.string().min(1).optional(),

  // Web Login
  username: z.string().optional(),
  password: z.string().optional(),
});

export type FormData = z.infer<typeof schema>;

type Props = {
  value?: string;
};

export const UserSecretsForm = ({ value }: Props) => {
  // TODO: create API hook 
  // const createUserSecret = useCreateSharedSecret();

  const {
    control,
    // reset,
    // handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      content: value || ""
    }
  });

  /**
  const onFormSubmit = async ({
    name,
    password,
    secret,
    expiresIn,
    viewLimit,
    accessType
  }: FormData) => {
    try {
      const expiresAt = new Date(new Date().getTime() + Number(expiresIn));

      const { id } = await createUserSecret.mutateAsync({
        name,
        password,
        secretValue: secret,
        expiresAt,
        expiresAfterViews: viewLimit === "-1" ? undefined : Number(viewLimit),
        accessType
      });

      const link = `${window.location.origin}/shared/secret/${id}`;

      setSecretLink(link);
      reset();

      navigator.clipboard.writeText(link);
      setCopyTextSecret("secret");

      createNotification({
        text: "Shared secret link copied to clipboard.",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a shared secret.",
        type: "error"
      });
    }
  };
  **/

  return (
    // TODO: handleSubmit(onFormSubmit)
    <form onSubmit={() => {}}>
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
              disabled={value !== undefined}
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
