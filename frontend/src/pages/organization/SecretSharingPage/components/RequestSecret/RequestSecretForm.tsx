import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy, faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input, Select, SelectItem } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { SecretSharingAccessType, useCreateSecretRequest } from "@app/hooks/api/secretSharing";

const schema = z.object({
  name: z.string().optional(),
  accessType: z
    .nativeEnum(SecretSharingAccessType)
    .default(SecretSharingAccessType.Anyone)
    .optional(),
  expiresIn: z.string()
});

const expiresInOptions = [
  { label: "5 min", value: 5 * 60 * 1000 },
  { label: "30 min", value: 30 * 60 * 1000 },
  { label: "1 hour", value: 60 * 60 * 1000 },
  { label: "1 day", value: 24 * 60 * 60 * 1000 },
  { label: "7 days", value: 7 * 24 * 60 * 60 * 1000 },
  { label: "14 days", value: 14 * 24 * 60 * 60 * 1000 },
  { label: "30 days", value: 30 * 24 * 60 * 60 * 1000 }
];

export type FormData = z.infer<typeof schema>;

export const RequestSecretForm = () => {
  const [secretLink, setSecretLink] = useState("");
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const { mutateAsync: createSecretRequest } = useCreateSecretRequest();

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ name, accessType, expiresIn }: FormData) => {
    const expiresAt = new Date(new Date().getTime() + Number(expiresIn));

    try {
      const { id } = await createSecretRequest({
        name,
        accessType,
        expiresAt
      });

      const link = `${window.location.origin}/secret-request/secret/${id}`;

      setSecretLink(link);
      reset();

      navigator.clipboard.writeText(link);
      setCopyTextSecret("secret");

      createNotification({
        text: "Shared secret link copied to clipboard.",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to create a shared secret.",
        type: "error"
      });
    }
  };

  const hasSecretLink = Boolean(secretLink);

  return !hasSecretLink ? (
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
        name="expiresIn"
        defaultValue="3600000"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl
            label="Expires In"
            errorText={error?.message}
            tooltipText="Select for how long someone is able to input the secret. If a secret is shared with you in time, it will remain available to you, even after the expiration."
            isError={Boolean(error)}
          >
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
        name="accessType"
        defaultValue={SecretSharingAccessType.Organization}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl
            tooltipText="Select who is able to input the secret"
            label="General Access"
            errorText={error?.message}
            isError={Boolean(error)}
          >
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

      <Button
        className="mt-4"
        size="sm"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting}
      >
        Create Request Link
      </Button>
    </form>
  ) : (
    <>
      <div className="mr-2 flex items-center justify-end rounded-md bg-white/5 p-2 text-base text-gray-400">
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
        Request Another Secret
      </Button>
    </>
  );
};
