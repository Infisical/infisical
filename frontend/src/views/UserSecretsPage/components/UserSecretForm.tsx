import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, FormControl, Input, Select, SelectItem } from "@app/components/v2";

const enum SecretType {
  WEB_LOGIN = "web_login",
  CREDIT_CARD = "credit_card",
  SECURE_NOTE = "secure_note"
}

const secretTypeOptions = [
  { label: "Login Credentials", value: SecretType.WEB_LOGIN },
  { label: "Credit Card", value: SecretType.CREDIT_CARD },
  { label: "Secure Note", value: SecretType.SECURE_NOTE }
];

const secretNamePlaceholder = {
  [SecretType.WEB_LOGIN]: "Google Account, Facebook Account...",
  [SecretType.CREDIT_CARD]: "Visa Card, Mastercard...",
  [SecretType.SECURE_NOTE]: "Confidential Work Info, Important Account Info..."
};

const schema = z
  .object({
    id: z.number().int().positive().optional(), // Optional, as this is typically assigned by the database
    secret_type: z.enum([SecretType.WEB_LOGIN, SecretType.CREDIT_CARD, SecretType.SECURE_NOTE]),
    name: z
      .string()
      .min(1, "Please enter a name for your secret")
      .max(100, "Please enter less than 100 characters"),
    login_url: z.string().url().optional(), // Optional for non-web login secrets
    username: z.string().optional(), // Username is optional and can be encrypted
    password: z.string().optional(), // Password is optional and can be encrypted
    is_username_secret: z.boolean().default(false), // Defaults to false
    card_number: z
      .string()
      .regex(/^\d{13,19}$/, "Please enter a valid card number")
      .optional(), // Optional, and regex to ensure numbers only with typical card length
    expiry_date: z
      .string()
      .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Invalid expiry date format. Use MM/YY format.")
      .optional(),
    cvv: z
      .string()
      .regex(/^\d{3,4}$/, "Please enter a valid cvv")
      .optional(), // Optional, typically 3 or 4 digits
    note: z.string().optional(), // Optional for secure note content
    created_at: z.date().optional(), // Typically assigned by the database
    updated_at: z.date().optional() // Typically assigned by the database
  })
  .superRefine((data, ctx) => {
    switch (data.secret_type) {
      case SecretType.WEB_LOGIN:
        if (!data.username) {
          ctx.addIssue({
            path: ["username"],
            message: "Please enter a username.",
            code: z.ZodIssueCode.custom
          });
        }
        if (!data.password) {
          ctx.addIssue({
            path: ["password"],
            message: "Please enter a password.",
            code: z.ZodIssueCode.custom
          });
        }
        break;

      case SecretType.CREDIT_CARD:
        if (!data.card_number) {
          ctx.addIssue({
            path: ["card_number"],
            message: "Please enter a card number.",
            code: z.ZodIssueCode.custom
          });
        }
        if (!data.expiry_date) {
          ctx.addIssue({
            path: ["expiry_date"],
            message: "Please enter an expiry date.",
            code: z.ZodIssueCode.custom
          });
        }
        break;

      case SecretType.SECURE_NOTE:
        if (!data.note) {
          ctx.addIssue({
            path: ["note"],
            message: "Please enter a note.",
            code: z.ZodIssueCode.custom
          });
        }
        break;

      default:
        break;
    }
  });

export type FormData = z.infer<typeof schema>;

export const UserSecretForm = () => {
  // const privateSharedSecretCreator = useCreateSharedSecret();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secret_type: SecretType.WEB_LOGIN
    }
  });

  const onFormSubmit = async (formData: FormData) => {
    try {
      console.log("formData", formData);
      // const expiresAt = new Date(new Date().getTime() + Number(expiresIn));

      // const key = crypto.randomBytes(16).toString("hex");
      // const hashedHex = crypto.createHash("sha256").update(key).digest("hex");
      // const { ciphertext, iv, tag } = encryptSymmetric({
      //   plaintext: secret,
      //   key
      // });

      // const { id } = await createSharedSecret.mutateAsync({
      //   name,
      //   encryptedValue: ciphertext,
      //   hashedHex,
      //   iv,
      //   tag,
      //   expiresAt,
      //   expiresAfterViews: viewLimit === "-1" ? undefined : Number(viewLimit),
      //   accessType
      // });

      // setSecretLink(
      //   `${window.location.origin}/shared/secret/${id}?key=${encodeURIComponent(
      //     hashedHex
      //   )}-${encodeURIComponent(key)}`
      // );
      // reset();

      // setCopyTextSecret("secret");
      createNotification({
        text: "Successfully created a shared secret",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a shared secret",
        type: "error"
      });
    }
  };

  const secretType = watch("secret_type");

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="secret_type"
        defaultValue={SecretType.WEB_LOGIN}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Secret Type" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {secretTypeOptions.map(({ label, value: expiresInValue }) => (
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
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Secret Name" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder={secretNamePlaceholder[secretType]} type="text" />
          </FormControl>
        )}
      />

      {secretType === SecretType.WEB_LOGIN && (
        <>
          <Controller
            control={control}
            name="login_url"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Login URL (Optional)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="https://example.com/login" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="username"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Username / Email"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} autoComplete="off" placeholder="admin@example.com" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="is_username_secret"
            defaultValue={false}
            render={({ field: { onBlur, value, onChange } }) => (
              <div className="mb-5 ml-2">
                <Checkbox
                  id="username-as-secret"
                  isChecked={value}
                  onCheckedChange={onChange}
                  onBlur={onBlur}
                >
                  Treat username as sensitive
                </Checkbox>
              </div>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Password" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} autoComplete="off" placeholder="" type="password" />
              </FormControl>
            )}
          />
        </>
      )}

      {secretType === SecretType.CREDIT_CARD && (
        <>
          <Controller
            control={control}
            name="card_number"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Card Number" isError={Boolean(error)} errorText={error?.message}>
                <Input
                  {...field}
                  placeholder="XXXX XXXX XXXX XXXX"
                  inputMode="numeric" // Suggests numeric keyboard on mobile devices
                  type="text"
                />
              </FormControl>
            )}
          />
          <div className="flex w-full flex-row items-start justify-center space-x-2">
            <Controller
              control={control}
              name="expiry_date"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Expiry Date"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="w-1/2"
                >
                  <Input
                    {...field}
                    placeholder="MM/YY"
                    type="text"
                    pattern="(0[1-9]|1[0-2])\/\d{2}"
                    maxLength={5} // Ensures the input does not exceed MM/YY length
                    inputMode="numeric" // Suggests numeric keyboard on mobile devices
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="cvv"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="CVV (Optional)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="w-1/2"
                >
                  <Input
                    {...field}
                    placeholder="XXX"
                    maxLength={4}
                    type="password"
                    inputMode="numeric"
                  />
                </FormControl>
              )}
            />
          </div>
        </>
      )}

      {secretType === SecretType.SECURE_NOTE && (
        <Controller
          control={control}
          name="note"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Enter Secret Note"
              isError={Boolean(error)}
              errorText={error?.message}
              className="mb-2"
            >
              <textarea
                placeholder="Enter any sensitive data..."
                {...field}
                className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 py-1.5 px-2 text-bunker-300 outline-none transition-all placeholder:text-mineshaft-400 placeholder:opacity-50 hover:border-primary-400/30 focus:border-primary-400/50 group-hover:mr-2"
              />
            </FormControl>
          )}
        />
      )}

      <Button
        className="mt-4"
        size="sm"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting}
      >
        Add Secret
      </Button>
    </form>
  );
};
