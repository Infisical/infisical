import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import checkPassword from "@app/components/utilities/checks/password/checkPassword";
import { Button, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";
import { useResetUserPasswordV2, useSendPasswordSetupEmail } from "@app/hooks/api/auth/queries";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";
import { clearSession } from "@app/hooks/api/users/queries";

type Errors = {
  tooShort?: string;
  tooLong?: string;
  noLetterChar?: string;
  noNumOrSpecialChar?: string;
  repeatedChar?: string;
  escapeChar?: string;
  lowEntropy?: string;
  breached?: string;
};

const schema = z
  .object({
    oldPassword: z.string(),
    newPassword: z.string()
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const ChangePasswordSection = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { user } = useUser();
  const { reset, control, handleSubmit } = useForm({
    defaultValues: {
      oldPassword: "",
      newPassword: ""
    },
    resolver: zodResolver(schema)
  });
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);
  const sendSetupPasswordEmail = useSendPasswordSetupEmail();
  const { mutateAsync: resetPasswordV2 } = useResetUserPasswordV2();

  const onFormSubmit = async ({ oldPassword, newPassword }: FormData) => {
    try {
      const errorCheck = await checkPassword({
        password: newPassword,
        setErrors
      });

      if (errorCheck) return;
      setIsLoading(true);

      if (user.encryptionVersion !== UserEncryptionVersion.V2) {
        createNotification({
          text: "Legacy encryption scheme not supported for changing password. Please contact support.",
          type: "error"
        });

        setIsLoading(false);
        return;
      }

      await resetPasswordV2({
        oldPassword,
        newPassword
      });
      clearSession();

      setIsLoading(false);
      createNotification({
        text: "Successfully changed password",
        type: "success"
      });

      reset();
      navigate({ to: "/login" });
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      createNotification({
        text: "Failed to change password",
        type: "error"
      });
    }
  };

  const onSetupPassword = async () => {
    await sendSetupPasswordEmail.mutateAsync();

    createNotification({
      title: "Password setup verification email sent",
      text: "Check your email to confirm password setup",
      type: "info"
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="mb-8 flex-1 text-xl font-medium text-mineshaft-100">Change password</h2>
      <div className="max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                placeholder="Old password"
                type="password"
                {...field}
                className="bg-mineshaft-800"
              />
            </FormControl>
          )}
          control={control}
          name="oldPassword"
        />
      </div>
      <div className="max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                placeholder="New password"
                type="password"
                {...field}
                className="bg-mineshaft-800"
              />
            </FormControl>
          )}
          control={control}
          name="newPassword"
        />
      </div>
      {Object.keys(errors).length > 0 && (
        <div className="my-4 flex max-w-md flex-col items-start rounded-md bg-white/5 px-2 py-2">
          <div className="mb-2 text-sm text-gray-400">{t("section.password.validate-base")}</div>
          {Object.keys(errors).map((key) => {
            if (errors[key as keyof Errors]) {
              return (
                <div className="items-top ml-1 flex flex-row justify-start" key={key}>
                  <div>
                    <FontAwesomeIcon icon={faXmark} className="text-md mr-2.5 ml-0.5 text-red" />
                  </div>
                  <p className="text-sm text-gray-400">{errors[key as keyof Errors]}</p>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
      <Button type="submit" colorSchema="secondary" isLoading={isLoading} isDisabled={isLoading}>
        Save
      </Button>
      <p className="mt-2 font-inter text-sm text-mineshaft-400">
        Need to setup a password?{" "}
        <button
          onClick={onSetupPassword}
          type="button"
          className="underline underline-offset-2 hover:text-mineshaft-200"
        >
          Click here
        </button>
      </p>
    </form>
  );
};
