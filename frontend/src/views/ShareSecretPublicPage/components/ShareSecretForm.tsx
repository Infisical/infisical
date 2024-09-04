import crypto from "crypto";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { encryptSymmetric } from "@app/components/utilities/cryptography/crypto";
import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { useCreatePublicSharedSecret, useCreateSharedSecret } from "@app/hooks/api";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing";

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
  accessType: z.nativeEnum(SecretSharingAccessType).optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  isPublic: boolean; // whether or not this is a public (non-authenticated) secret sharing form
  value?: string;
};

export const ShareSecretForm = ({ isPublic, value }: Props) => {
  const [secretLink, setSecretLink] = useState("");
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const publicSharedSecretCreator = useCreatePublicSharedSecret();
  const privateSharedSecretCreator = useCreateSharedSecret();
  const createSharedSecret = isPublic ? publicSharedSecretCreator : privateSharedSecretCreator;

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

  const onFormSubmit = async ({
    name,
    password,
    secret,
    expiresIn,
    viewLimit,
    accessType
  }: FormData) => {
    try {
      const expiresAt = new Date(new Date().getTime() + Number(expiresIn));

      const key = crypto.randomBytes(16).toString("hex");
      const hashedHex = crypto.createHash("sha256").update(key).digest("hex");
      const { ciphertext, iv, tag } = encryptSymmetric({
        plaintext: secret,
        key
      });

      const { id } = await createSharedSecret.mutateAsync({
        name,
        password,
        encryptedValue: ciphertext,
        hashedHex,
        iv,
        tag,
        expiresAt,
        expiresAfterViews: viewLimit === "-1" ? undefined : Number(viewLimit),
        accessType
      });

      setSecretLink(
        `${window.location.origin}/shared/secret/${id}?key=${encodeURIComponent(
          hashedHex
        )}-${encodeURIComponent(key)}`
      );
      reset();

      setCopyTextSecret("secret");
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

  const hasSecretLink = Boolean(secretLink);

  return !hasSecretLink ? (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      {!isPublic && (
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Name (Optional)"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="API Key" type="text" />
            </FormControl>
          )}
        />
      )}
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
      {!isPublic && (
        <Controller
          control={control}
          name="accessType"
          defaultValue={SecretSharingAccessType.Organization}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl label="General Access" errorText={error?.message} isError={Boolean(error)}>
              <Select
                defaultValue={field.value}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full"
              >
                <SelectItem value={SecretSharingAccessType.Anyone}>Anyone</SelectItem>
                <SelectItem value={SecretSharingAccessType.Organization}>
                  People within your organization
                </SelectItem>
              </Select>
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
        Create secret link
      </Button>
    </form>
  ) : (
    <>
      <div className="mr-2 flex items-center justify-end rounded-md bg-white/[0.05] p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{secretLink}</p>
        <IconButton
          ariaLabel="copy icon"
          colorSchema="secondary"
          className="group relative ml-2"
          onClick={() => {
            navigator.clipboard.writeText(secretLink);
            setCopyTextSecret("Copied");
          }}
        >
          <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} />
        </IconButton>
      </div>
      <Button
        className="mt-4 w-full bg-mineshaft-700 py-3 text-bunker-200"
        colorSchema="primary"
        variant="outline_bg"
        size="sm"
        onClick={() => setSecretLink("")}
        rightIcon={<FontAwesomeIcon icon={faRedo} className="pl-2" />}
      >
        Share another secret
      </Button>
    </>
  );
};
