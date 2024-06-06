import crypto from "crypto";

import { Controller } from "react-hook-form";
import { AxiosError } from "axios";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { encryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { useCreatePublicSharedSecret, useCreateSharedSecret } from "@app/hooks/api/secretSharing";

const schema = yup.object({
  value: yup.string().max(10000).required().label("Shared Secret Value"),
  expiresAfterViews: yup.number().min(1).required().label("Expires After Views"),
  expiresInValue: yup.number().min(1).required().label("Expiration Value"),
  expiresInUnit: yup.string().required().label("Expiration Unit")
});

export type FormData = yup.InferType<typeof schema>;

export const AddShareSecretForm = ({
  isPublic,
  inModal,
  handleSubmit,
  control,
  isSubmitting,
  setNewSharedSecret
}: {
  isPublic: boolean;
  inModal: boolean;
  handleSubmit: any;
  control: any;
  isSubmitting: boolean;
  setNewSharedSecret: (value: string) => void;
}) => {
  const publicSharedSecretCreator = useCreatePublicSharedSecret();
  const privateSharedSecretCreator = useCreateSharedSecret();
  const createSharedSecret = isPublic ? publicSharedSecretCreator : privateSharedSecretCreator;

  const expirationUnitsAndActions = [
    {
      unit: "Minutes",
      action: (expiresAt: Date, expiresInValue: number) =>
        expiresAt.setMinutes(expiresAt.getMinutes() + expiresInValue)
    },
    {
      unit: "Hours",
      action: (expiresAt: Date, expiresInValue: number) =>
        expiresAt.setHours(expiresAt.getHours() + expiresInValue)
    },
    {
      unit: "Days",
      action: (expiresAt: Date, expiresInValue: number) =>
        expiresAt.setDate(expiresAt.getDate() + expiresInValue)
    },
    {
      unit: "Weeks",
      action: (expiresAt: Date, expiresInValue: number) =>
        expiresAt.setDate(expiresAt.getDate() + expiresInValue * 7)
    }
  ];
  const onFormSubmit = async ({
    value,
    expiresInValue,
    expiresInUnit,
    expiresAfterViews
  }: FormData) => {
    try {
      const key = crypto.randomBytes(16).toString("hex");
      const hashedHex = crypto.createHash("sha256").update(key).digest("hex");
      const { ciphertext, iv, tag } = encryptSymmetric({
        plaintext: value,
        key
      });

      const expiresAt = new Date();
      const updateExpiresAt = expirationUnitsAndActions.find(
        (item) => item.unit === expiresInUnit
      )?.action;
      if (updateExpiresAt && expiresInValue) {
        updateExpiresAt(expiresAt, expiresInValue);
      }

      const { id } = await createSharedSecret.mutateAsync({
        encryptedValue: ciphertext,
        iv,
        tag,
        hashedHex,
        expiresAt,
        expiresAfterViews
      });
      setNewSharedSecret(
        `${window.location.origin}/shared/secret/${id}?key=${encodeURIComponent(
          hashedHex
        )}-${encodeURIComponent(key)}`
      );

      createNotification({
        text: "Successfully created a shared secret",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const axiosError = err as AxiosError;
      if (axiosError?.response?.status === 401) {
        createNotification({
          text: "You do not have access to create shared secrets",
          type: "error"
        });
      } else {
        createNotification({
          text: "Failed to create a shared secret",
          type: "error"
        });
      }
    }
  };
  return (
    <form className="flex w-full flex-col items-center" onSubmit={handleSubmit(onFormSubmit)}>
      <div
        className={`w-[${inModal ? "33rem" : "36rem"}] ${
          !inModal && "border border-mineshaft-600 bg-mineshaft-800 p-4"
        }`}
      >
        <div className="mb-4">
          <Controller
            control={control}
            name="value"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Shared Secret"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <SecretInput
                  isVisible
                  {...field}
                  containerClassName="py-1.5 rounded-md transition-all group-hover:mr-2 text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 min-h-[70px]"
                />
              </FormControl>
            )}
          />
        </div>
        <div className="flex w-full flex-row justify-center">
          <div className="w-2/7 flex">
            <Controller
              control={control}
              name="expiresAfterViews"
              defaultValue={6}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-4 w-full"
                  label="Expires After Views"
                  isError={Boolean(error)}
                  errorText="Please enter a valid number of views"
                >
                  <Input {...field} type="number" min={1} />
                </FormControl>
              )}
            />
          </div>
          <div className="w-1/7 flex items-center justify-center px-2">
            <p className="px-4 text-sm text-gray-400">OR</p>
          </div>
          <div className="w-4/7 flex">
            <div className="flex w-full">
              <div className="flex w-2/5 w-full justify-center">
                <Controller
                  control={control}
                  name="expiresInValue"
                  defaultValue={6}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Expires after Time"
                      isError={Boolean(error)}
                      errorText="Please enter a valid time duration"
                    >
                      <Input {...field} type="number" min={0} />
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex w-3/5 w-full justify-center">
                <Controller
                  control={control}
                  name="expiresInUnit"
                  defaultValue={expirationUnitsAndActions[0].unit}
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl label="Unit" errorText={error?.message} isError={Boolean(error)}>
                      <Select
                        defaultValue={field.value}
                        {...field}
                        onValueChange={(e) => onChange(e)}
                        className="w-full"
                      >
                        {expirationUnitsAndActions.map(({ unit }) => (
                          <SelectItem value={unit} key={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={`flex items-center ${!inModal && "justify-center"}`}>
          <Button className="mr-4" type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
            {inModal ? "Create" : "Share your own Secret"}
          </Button>
          {inModal && (
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          )}
        </div>
      </div>
    </form>
  );
};
