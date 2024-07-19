import crypto from "crypto";

import { useEffect, useRef } from "react";
import { Controller } from "react-hook-form";
import { AxiosError } from "axios";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { encryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button, Checkbox, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";
import { SecretSharingAccessType, useCreatePublicSharedSecret, useCreateSharedSecret } from "@app/hooks/api/secretSharing";

const schema = yup.object({
  value: yup.string().max(10000).required().label("Shared Secret Value"),
  expiresAfterSingleView: yup.boolean().required().label("Expires After Views"),
  expiresInValue: yup.number().min(1).required().label("Expiration Value"),
  expiresInUnit: yup.string().required().label("Expiration Unit"),
  accessType: yup.string().required().label("General Access")
});

export type FormData = yup.InferType<typeof schema>;

export const AddShareSecretForm = ({
  isPublic,
  inModal,
  handleSubmit,
  control,
  isSubmitting,
  setNewSharedSecret,
  isInputDisabled
}: {
  isPublic: boolean;
  inModal: boolean;
  handleSubmit: any;
  control: any;
  isSubmitting: boolean;
  setNewSharedSecret: (value: string) => void;
  isInputDisabled?: boolean;
}) => {
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

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
    expiresAfterSingleView,
    accessType
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
        expiresAfterViews: expiresAfterSingleView ? 1 : 1000,
        accessType: accessType as SecretSharingAccessType
      });

      if (isMounted.current) {
        setNewSharedSecret(
          `${window.location.origin}/shared/secret/${id}?key=${encodeURIComponent(
            hashedHex
          )}-${encodeURIComponent(key)}`
        );
        createNotification({
          text: "Successfully created a shared secret",
          type: "success"
        });
      }
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
    <form className="flex w-full flex-col items-center px-4 sm:px-0" onSubmit={handleSubmit(onFormSubmit)}>
      <div
        className={`w-full ${!inModal && "rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6"}`}
      >
        <div>
          <Controller
            control={control}
            name="value"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Shared Secret"
                isError={Boolean(error)}
                errorText={error?.message}
                className="mb-2"
              >
                <textarea
                  disabled={isInputDisabled}
                  placeholder="Enter sensitive data to share via an encrypted link..."
                  {...field}
                  className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 py-1.5 px-2 text-bunker-300 outline-none transition-all placeholder:text-mineshaft-400 hover:border-primary-400/30 focus:border-primary-400/50 group-hover:mr-2"
                />
              </FormControl>
            )}
          />
        </div>
        <div className="flex w-full flex-col md:flex-row justify-stretch">
          <div className="flex justify-start">
            <div className="flex justify-start">
              <div className="flex w-full justify-center pr-2">
                <Controller
                  control={control}
                  name="expiresInValue"
                  defaultValue={1}
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Expires after Time"
                      isError={Boolean(error)}
                      errorText="Please enter a valid time duration"
                      className="w-32"
                    >
                      <Input {...field} type="number" min={0} />
                    </FormControl>
                  )}
                />
              </div>
              <div className="flex justify-center">
                <Controller
                  control={control}
                  name="expiresInUnit"
                  defaultValue={expirationUnitsAndActions[1].unit}
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl label="Unit" errorText={error?.message} isError={Boolean(error)}>
                      <Select
                        defaultValue={field.value}
                        {...field}
                        onValueChange={(e) => onChange(e)}
                        className="w-full border border-mineshaft-600"
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
          <div className="sm:w-1/7 mx-auto items-center justify-center hidden md:flex">
            <p className="mt-2 text-sm text-gray-400">AND</p>
          </div>
          <div className="items-center pb-4 md:pb-0 md:pt-2 flex">
            <Controller
              control={control}
              name="expiresAfterViews"
              defaultValue={1}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="mb-4 w-full hidden"
                  label="Expires after Views"
                  isError={Boolean(error)}
                  errorText="Please enter a valid number of views"
                >
                  <Input {...field} type="number" min={1} />
                </FormControl>
              )}
            />
            <div className="bg-mineshaft-900 py-2 h-max rounded-md border border-mineshaft-600 px-4">
              <Controller
                control={control}
                name="expiresAfterSingleView"
                defaultValue={false}
                render={({ field: { onBlur, value, onChange } }) => (
                  <Checkbox
                    id="is-single-view"
                    isChecked={value}
                    onCheckedChange={onChange}
                    isDisabled={false}
                    onBlur={onBlur}
                  >
                    Can be viewed only 1 time
                  </Checkbox>
                )}
              />
            </div>
          </div>
        </div>
        {!isPublic && (
          <Controller
            control={control}
            name="accessType"
            defaultValue="organization"
            render={({ field: { onChange, ...field } }) => (
              <FormControl label="General Access">
                <Select
                  {...field}
                  onValueChange={(e) => onChange(e)}
                >
                  <SelectItem value="organization">People within your organization</SelectItem>
                  <SelectItem value="anyone">Anyone</SelectItem>
                </Select>
              </FormControl>
            )}
          />
        )}
        <div className={`flex items-center space-x-4 pt-2 ${!inModal && ""}`}>
          <Button className="mr-0" type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
            {inModal ? "Create" : "Share Secret"}
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
