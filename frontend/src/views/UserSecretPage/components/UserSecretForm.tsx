import crypto from "crypto";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { encryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { useCreateUserSecret } from "@app/hooks/api";
import { UserSecretType } from "@app/hooks/api/userSecrets";

// values in ms
const expiresInOptions = [
  { label: "5 min", value: 5 * 60 * 1000 },
  { label: "30 min", value: 30 * 60 * 1000 },
  { label: "1 hour", value: 60 * 60 * 1000 },
  { label: "1 day", value: 24 * 60 * 60 * 1000 },
  { label: "7 days", value: 7 * 24 * 60 * 60 * 1000 },
  { label: "14 days", value: 14 * 24 * 60 * 60 * 1000 },
  { label: "30 days", value: 30 * 24 * 60 * 60 * 1000 }
];

const viewLimitOptions = [
  { label: "1", value: 1 },
  { label: "Unlimited", value: -1 }
];

const schema = z.object({
  name: z.string().optional(),
  password: z.string().optional(),
  secret: z.string().min(1),
  expiresIn: z.string(),
  viewLimit: z.string(),
  secretType: z.nativeEnum(UserSecretType).optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  isPublic: boolean; // whether or not this is a public (non-authenticated) secret sharing form
  value?: string;
};

export const UserSecretForm = ({ value }: Props) => {
  const createUserSecret = useCreateUserSecret();

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secret: value || ""
    }
  });

  const onFormSubmit = async ({ name, password, secret, secretType }: FormData) => {
    try {
      const key = crypto.randomBytes(16).toString("hex");
      const hashedHex = crypto.createHash("sha256").update(key).digest("hex");
      const { ciphertext, iv, tag } = encryptSymmetric({
        plaintext: secret,
        key
      });

      // const { id } =
      await createUserSecret.mutateAsync({
        name,
        password,
        encryptedValue: ciphertext,
        hashedHex,
        iv,
        tag,
        secretType
      });

      reset();

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
            <Input {...field} placeholder="API Key" type="text" />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="secret"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Your Secret"
            isError={Boolean(error)}
            errorText={error?.message}
            className="mb-2"
            isRequired
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
      <Controller
        control={control}
        name="expiresIn"
        defaultValue="3600000"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Expires In" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {expiresInOptions.map(({ label, value: expiresInValue }) => (
                <SelectItem value={String(expiresInValue || "")} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="viewLimit"
        defaultValue="-1"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Max Views" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {viewLimitOptions.map(({ label, value: viewLimitValue }) => (
                <SelectItem value={String(viewLimitValue || "")} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
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
        Create secret link
      </Button>
    </form>
  );
};
