import { FC, useState } from "react";
import { Controller, SubmitHandler,useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import attemptChangePassword from "@app/components/utilities/attemptChangePassword";
import { breachedPasswordCheck, PasswordErrors,primaryPasswordCheck } from "@app/components/utilities/checks/password/checkPassword";
import { Button, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";

const schema = yup
  .object({
    oldPassword: yup.string().required("Old password is required"),
    newPassword: yup.string().required("New password is required")
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

export const ChangePasswordSection: FC = () => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { createNotification } = useNotificationContext();
  const { user } = useUser();
  const { reset, control, handleSubmit } = useForm<FormData>({
    defaultValues: {
      oldPassword: "",
      newPassword: ""
    },
    resolver: yupResolver(schema)
  });
  const [primaryPasswordErrors, setPrimaryPasswordErrors] = useState<Omit<PasswordErrors, "breached">>({});
  const [newPasswordValue, setNewPasswordValue] = useState<string>("");

  const onFormSubmit: SubmitHandler<FormData> = async ({ oldPassword, newPassword }) => {
    try {
      setIsLoading(true);

      // validate user/organization info
      if (!user?.email) {
        setIsLoading(false);
        return;
      }

      // Remove this??? (redundant due to submit button disable if any primaryPasswordErrors?)
      // Primary password check
      const primaryPasswordError = await primaryPasswordCheck({
        password: newPassword,
        setPrimaryPasswordErrors
      });

      let primaryPasswordErrorsTimeout;

      if (primaryPasswordError) {
        setNewPasswordValue("");
        reset({newPassword: ""});
        setIsLoading(false);

        if (primaryPasswordErrorsTimeout) {
          clearTimeout(primaryPasswordErrorsTimeout);
        }

        primaryPasswordErrorsTimeout = setTimeout(() => {
          setPrimaryPasswordErrors({});
        }, 4000);

        return;
      }

      // Secondary password check
      const { isBreached, errorMessage } = await breachedPasswordCheck({ password: newPassword });

      if (isBreached) {
        createNotification({
          text: errorMessage || "New password has previously appeared in a data breach and should never be used. Please choose a stronger password.",
          type: "error"
        });
        setNewPasswordValue("");
        reset({newPassword: ""});
        setIsLoading(false);
        return;
      }

      // passed all validation checks - proceed to attempt password change
      setIsLoading(true);

      await attemptChangePassword({
        email: user.email,
        currentPassword: oldPassword,
        newPassword
      });

      setIsLoading(false);
      createNotification({
        text: "Successfully changed password",
        type: "success"
      });

      reset();
      setNewPasswordValue("");
      setPrimaryPasswordErrors({});
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      createNotification({
        text: "Failed to change password",
        type: "error"
      });

      reset();
      setNewPasswordValue("");
      setPrimaryPasswordErrors({});
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">Change password</h2>
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
          defaultValue={newPasswordValue}
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
      {Object.keys(primaryPasswordErrors).length > 0 && (
        <div className="my-4 flex max-w-md flex-col items-start rounded-md bg-white/5 px-2 py-2">
          <div className="mb-2 text-sm text-gray-400">{t("section.password.validate-base")}</div>
          {Object.keys(primaryPasswordErrors).map((key) => {
            if (primaryPasswordErrors[key as keyof Omit<PasswordErrors, "breached">]) {
              return (
                <div className="items-top ml-1 flex flex-row justify-start" key={key}>
                  <div>
                    <FontAwesomeIcon icon={faXmark} className="text-md ml-0.5 mr-2.5 text-red" />
                  </div>
                  <p className="text-sm text-gray-400">{primaryPasswordErrors[key as keyof Omit<PasswordErrors, "breached">]}</p>
                </div>
              );
            }

            return null;
          })}
        </div>
      )}
      <Button 
        type="submit"
        colorSchema="secondary"
        isLoading={isLoading}
        isDisabled={Object.keys(primaryPasswordErrors).length > 0 || isLoading}
      >
        Save
      </Button>
    </form>
  );
};
