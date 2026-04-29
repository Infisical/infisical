import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import { Check, Copy, Info, ReplyIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
  { label: "5 min", value: "5m" },
  { label: "30 min", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" }
];

export type FormData = z.infer<typeof schema>;

export const RequestSecretForm = () => {
  const [secretLink, setSecretLink] = useState("");
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });
  const subOrganization = useSearch({
    strict: false,
    select: (el) => el?.subOrganization
  });

  const { mutateAsync: createSecretRequest } = useCreateSecretRequest();

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      expiresIn: "7d"
    }
  });

  const onFormSubmit = async ({ name, accessType, expiresIn }: FormData) => {
    const { id } = await createSecretRequest({
      name,
      accessType,
      expiresIn
    });

    const link = new URL(`${window.location.origin}/secret-request/secret/${id}`);
    if (subOrganization) {
      link.searchParams.set("subOrganization", subOrganization);
    }

    setSecretLink(link.toString());
    reset();

    navigator.clipboard.writeText(link.toString());
    setCopyTextSecret("secret");

    createNotification({
      text: "Shared secret link copied to clipboard.",
      type: "success"
    });
  };

  const hasSecretLink = Boolean(secretLink);

  return !hasSecretLink ? (
    <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Name <span className="text-xs text-muted italic">- Optional</span>
            </FieldLabel>
            <Input {...field} placeholder="API Key" type="text" isError={Boolean(error)} />
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />

      <Controller
        control={control}
        name="expiresIn"
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Expires In
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3 cursor-help text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Select for how long someone is able to input the secret. If a secret is shared
                  with you in time, it will remain available to you, even after the expiration.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Select value={field.value} onValueChange={(e) => onChange(e)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expiresInOptions.map(({ label, value: expiresInValue }) => (
                  <SelectItem value={String(expiresInValue || "")} key={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />

      <Controller
        control={control}
        name="accessType"
        defaultValue={SecretSharingAccessType.Organization}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              General Access
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3 cursor-help text-muted" />
                </TooltipTrigger>
                <TooltipContent>Select who is able to input the secret</TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Select value={field.value} onValueChange={(e) => onChange(e)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SecretSharingAccessType.Anyone}>Anyone</SelectItem>
                <SelectItem value={SecretSharingAccessType.Organization}>
                  People within your organization
                </SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>Controls who can provide the requested secret</FieldDescription>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
      <div className="flex w-full justify-end">
        <Button variant="org" type="submit" isPending={isSubmitting} isDisabled={isSubmitting}>
          Create Request Link
        </Button>
      </div>
    </form>
  ) : (
    <>
      <div className="relative flex items-center justify-between rounded-md border border-border bg-container p-2 pr-5 pl-3 text-base text-label">
        <p className="mr-4 break-all">{secretLink}</p>
        <IconButton
          aria-label="copy icon"
          variant="ghost-muted"
          size="sm"
          className="absolute top-1 right-1"
          onClick={() => {
            navigator.clipboard.writeText(secretLink);
            setCopyTextSecret("Copied");
          }}
        >
          {isCopyingSecret ? <Check className="size-4" /> : <Copy className="size-4" />}
        </IconButton>
      </div>
      <Button className="w-full" variant="org" size="lg" onClick={() => setSecretLink("")}>
        Request Another Secret
        <ReplyIcon />
      </Button>
    </>
  );
};
