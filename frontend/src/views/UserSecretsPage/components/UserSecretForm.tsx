import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, FormControl, Input } from "@app/components/v2";
import {
  useCreateUserSecret,
  UserSecretType,
  useUpdateUserSecret
} from "@app/hooks/api/userSecrets";
import { UsePopUpState } from "@app/hooks/usePopUp";

const secretNamePlaceholder = {
  [UserSecretType.WEB_LOGIN]: "Google Account, Facebook Account...",
  [UserSecretType.CREDIT_CARD]: "Visa Card, Mastercard...",
  [UserSecretType.SECURE_NOTE]: "Confidential Work Info, Important Account Info..."
};

const schema = z
  .object({
    id: z.string().optional(),
    secretType: z.enum([
      UserSecretType.WEB_LOGIN,
      UserSecretType.CREDIT_CARD,
      UserSecretType.SECURE_NOTE
    ]),
    name: z
      .string()
      .min(1, "Please enter a name for your secret")
      .max(100, "Please enter less than 100 characters"),
    loginURL: z.string().url().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    cardLastFourDigits: z.string().optional(),
    isUsernameSecret: z.boolean().default(false),
    cardNumber: z
      .string()
      .regex(/^\d{13,19}$/, "Please enter a valid card number")
      .optional(),
    cardExpiry: z
      .string()
      .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Invalid expiry date format. Use MM/YY format.")
      .optional(),
    cardCvv: z
      .union([z.string().regex(/^\d{3,4}$/, "Please enter a valid cvv"), z.literal("")])
      .optional(),
    secureNote: z.string().optional()
  })
  .superRefine((data, ctx) => {
    switch (data.secretType) {
      case UserSecretType.WEB_LOGIN:
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

      case UserSecretType.CREDIT_CARD:
        if (!data.cardNumber) {
          ctx.addIssue({
            path: ["cardNumber"],
            message: "Please enter a card number.",
            code: z.ZodIssueCode.custom
          });
        }
        if (!data.cardExpiry) {
          ctx.addIssue({
            path: ["cardExpiry"],
            message: "Please enter an expiry date.",
            code: z.ZodIssueCode.custom
          });
        }
        break;

      case UserSecretType.SECURE_NOTE:
        if (!data.secureNote) {
          ctx.addIssue({
            path: ["secureNote"],
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

type Props = {
  popUp: UsePopUpState<["addOrUpdateUserSecret"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addOrUpdateUserSecret"]>) => void;
};

function removeNullValues(obj: Record<string, any>): Record<string, any> {
  return Object.entries(obj)
    .filter(([, value]) => value !== null)
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
}

export const UserSecretForm = ({ popUp, handlePopUpClose }: Props) => {
  const isEditMode = popUp.addOrUpdateUserSecret.data?.isEditMode ?? false;
  const createUserSecret = useCreateUserSecret();
  const updateUserSecret = useUpdateUserSecret();

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: removeNullValues(popUp.addOrUpdateUserSecret?.data?.secretValue || {})
  });

  const onFormSubmit = async (formData: FormData) => {
    try {
      const secretData = formData;
      secretData.cardLastFourDigits = formData.cardNumber?.slice(-4);
      if (isEditMode) {
        await updateUserSecret.mutateAsync({
          id: popUp.addOrUpdateUserSecret.data?.id,
          updateData: secretData
        });
      } else {
        await createUserSecret.mutateAsync(secretData);
      }

      handlePopUpClose("addOrUpdateUserSecret");
      createNotification({
        text: "Successfully saved your secret",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to save your secret",
        type: "error"
      });
    }
  };

  const secretType = watch("secretType");

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Secret Name" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder={secretNamePlaceholder[secretType]} type="text" />
          </FormControl>
        )}
      />

      {secretType === UserSecretType.WEB_LOGIN && (
        <>
          <Controller
            control={control}
            name="loginURL"
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
            name="isUsernameSecret"
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

      {secretType === UserSecretType.CREDIT_CARD && (
        <>
          <Controller
            control={control}
            name="cardNumber"
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
              name="cardExpiry"
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
                    maxLength={5} // Ensures the input does not exceed MM/YY length
                    inputMode="numeric" // Suggests numeric keyboard on mobile devices
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="cardCvv"
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

      {secretType === UserSecretType.SECURE_NOTE && (
        <Controller
          control={control}
          name="secureNote"
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
        {isEditMode ? "Update Secret" : "Add Secret"}
      </Button>
    </form>
  );
};
