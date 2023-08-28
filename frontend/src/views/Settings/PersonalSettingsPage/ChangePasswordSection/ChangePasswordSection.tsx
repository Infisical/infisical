import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import attemptChangePassword from "@app/components/utilities/attemptChangePassword";
import checkPassword from "@app/components/utilities/checks/password/checkPassword";
import { Button, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";

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

const schema = yup
  .object({
    oldPassword: yup.string().required("Old password is required"),
    newPassword: yup.string().required("New password is required")
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

export const ChangePasswordSection = () => {
  const { t } = useTranslation();
  const { createNotification } = useNotificationContext();
  const { user } = useUser();
  const { reset, control, handleSubmit } = useForm({
    defaultValues: {
      oldPassword: "",
      newPassword: ""
    },
    resolver: yupResolver(schema)
  });
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);

  const onFormSubmit = async ({ oldPassword, newPassword }: FormData) => {
    try {
      if (!user?.email) return;

      const errorCheck = await checkPassword({
        password: newPassword,
        setErrors
      });

      if (errorCheck) return;

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
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
      setIsLoading(false);
      createNotification({
        text: "Failed to change password",
        type: "error"
      });
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
                    <FontAwesomeIcon icon={faXmark} className="text-md ml-0.5 mr-2.5 text-red" />
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
    </form>
  );
};
