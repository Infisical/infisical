import crypto from "crypto";

import { useEffect, useRef } from "react";
import { Controller } from "react-hook-form";
import { AxiosError } from "axios";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { encryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button, FormControl, ModalClose, Select, SelectItem } from "@app/components/v2";
import {
  SecretSharingAccessType,
  useCreatePublicSharedSecret,
  useCreateSharedSecret
} from "@app/hooks/api/secretSharing";

const schema = yup.object({
  value: yup.string().max(10000).required().label("Shared Secret Value"),
  expiresAfterViews: yup.string().required().label("Expires After Views"),
  expiresInValue: yup.string().min(1).required().label("Expiration Value"),
  accessType: yup.string().required().label("General Access")
});

export type FormData = yup.InferType<typeof schema>;

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

  const onFormSubmit = async ({
    value,
    expiresInValue,
    expiresAfterViews,
    accessType
  }: FormData) => {
    try {
      const expiresAt = new Date(new Date().getTime() + Number(expiresInValue));

      const key = crypto.randomBytes(16).toString("hex");
      const hashedHex = crypto.createHash("sha256").update(key).digest("hex");
      const { ciphertext, iv, tag } = encryptSymmetric({
        plaintext: value,
        key
      });

      const { id } = await createSharedSecret.mutateAsync({
        encryptedValue: ciphertext,
        iv,
        tag,
        hashedHex,
        expiresAt,
        expiresAfterViews: expiresAfterViews === "-1" ? undefined : Number(expiresAfterViews),
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
    <form
      className="flex w-full max-w-7xl flex-col items-center"
      onSubmit={handleSubmit(onFormSubmit)}
    >
      <div
        className={`w-full ${
          !inModal && "rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6"
        }`}
      >
        <div>
          <Controller
            control={control}
            name="value"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Your Secret"
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
        <Controller
          control={control}
          name="expiresInValue"
          defaultValue="3600000"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl label="Expires In" errorText={error?.message} isError={Boolean(error)}>
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
              >
                {expiresInOptions.map(({ label, value }) => (
                  <SelectItem value={String(value || "")} key={label}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="expiresAfterViews"
          defaultValue="-1"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl label="Max Views" errorText={error?.message} isError={Boolean(error)}>
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
              >
                {viewLimitOptions.map(({ label, value }) => (
                  <SelectItem value={String(value || "")} key={label}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        {!isPublic && (
          <Controller
            control={control}
            name="accessType"
            defaultValue="organization"
            render={({ field: { onChange, ...field } }) => (
              <FormControl label="General Access">
                <Select {...field} onValueChange={(e) => onChange(e)} className="w-full">
                  <SelectItem value="organization">People within your organization</SelectItem>
                  <SelectItem value="anyone">Anyone</SelectItem>
                </Select>
              </FormControl>
            )}
          />
        )}
        <div className={`flex items-center space-x-4 pt-2 ${!inModal && ""}`}>
          <Button className="mr-0" type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
            {inModal ? "Create" : "Create secret link"}
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
