import crypto from "crypto";

import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { decryptSymmetric, encryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button, FormControl, Input } from "@app/components/v2";
import { useCreateUserSecret } from "@app/hooks/api";
import { TUserSecret, UserSecretType } from "@app/hooks/api/userSecrets";

const schema = z.object({
  name: z.string().optional(),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  website: z.string().min(1, "Website is required"),
  secretType: z.string()
});

const key = crypto.randomBytes(16).toString("hex");

export type FormData = z.infer<typeof schema>;

export const UserSecretWebLoginForm = ({
  secretType,
  readOnly,
  value,
  onCreate
}: {
  secretType: UserSecretType;
  onCreate: () => void;
  readOnly?: boolean;
  value?: TUserSecret;
}) => {
  const createUserSecret = useCreateUserSecret();

  const decryptedSecret = useMemo(() => {
    if (value && value.encryptedValue && key) {
      try {
        const res = decryptSymmetric({
          ciphertext: value.encryptedValue,
          iv: value.iv,
          tag: value.tag,
          key
        });
        if (res) {
          const decrypted = JSON.parse(res);
          return {
            name: value.name,
            username: decrypted.username,
            password: decrypted.password,
            website: decrypted.website
          };
        }
      } catch (error) {
        console.error(error);
      }
    }
    return "";
  }, [value, key]);

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: (decryptedSecret as any) || {
      name: "",
      username: "",
      password: "",
      website: "",
      secretType
    }
  });

  const onFormSubmit = async ({ name, username, password, website }: FormData) => {
    try {
      const secret = JSON.stringify({ username, password, website });

      const hashedHex = crypto.createHash("sha256").update(key).digest("hex");
      const { ciphertext, iv, tag } = encryptSymmetric({
        plaintext: secret,
        key
      });

      await createUserSecret.mutateAsync({
        name,
        encryptedValue: ciphertext,
        hashedHex,
        iv,
        secretType,
        tag
      });

      reset();

      onCreate();

      createNotification({
        text: "Successfully created a secret",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a secret",
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Name (Optional)" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} disabled={readOnly} placeholder="Name" type="text" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="username"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Username"
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
          >
            <Input
              {...field}
              disabled={readOnly}
              placeholder="Enter your username"
              type="text"
              autoComplete="off"
            />
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
            isRequired
          >
            <Input
              {...field}
              placeholder="Enter your password"
              type="password"
              autoComplete="new-password"
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="website"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Website"
            isError={Boolean(error)}
            errorText={error?.message}
            isRequired
          >
            <Input {...field} disabled={readOnly} placeholder="Enter the website URL" type="text" />
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
        Create secret
      </Button>
    </form>
  );
};
