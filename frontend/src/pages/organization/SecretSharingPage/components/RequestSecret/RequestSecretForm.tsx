import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckCircle2, Info, ReplyIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CopyButton,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { SecretSharingAccessType, useCreateSecretRequest } from "@app/hooks/api/secretSharing";
import { ms } from "@app/lib/fn/time";

const schema = z.object({
  name: z.string().optional(),
  accessType: z
    .nativeEnum(SecretSharingAccessType)
    .default(SecretSharingAccessType.Anyone)
    .optional(),
  expiresIn: z.string()
});

const expiresInOptions = [
  { label: "5 minutes", value: "5m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" }
];

const formatExpiry = (expiresIn: string) => {
  try {
    return format(new Date(Date.now() + ms(expiresIn)), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return null;
  }
};

export type FormData = z.infer<typeof schema>;

export const RequestSecretForm = () => {
  const [secretLink, setSecretLink] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null);
  const subOrganization = useSearch({
    strict: false,
    select: (el) => el?.subOrganization
  });

  const { mutateAsync: createSecretRequest } = useCreateSecretRequest();

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      expiresIn: "7d"
    }
  });

  const resolvedExpiry = formatExpiry(watch("expiresIn"));

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
    setLinkExpiresAt(formatExpiry(expiresIn));
    reset();

    await navigator.clipboard.writeText(link.toString());

    createNotification({
      text: "Secret request link copied to clipboard.",
      type: "success"
    });
  };

  if (secretLink) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <div>
            <p className="text-sm font-medium text-foreground">Request Link Created</p>
            <p className="mt-0.5 text-xs text-accent">
              Send this link to whoever holds the secret. The value they submit is encrypted and
              only visible to your organization.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-container">
          <div className="flex items-start justify-between gap-2 p-3">
            <p className="min-w-0 font-mono text-xs break-all text-label">{secretLink}</p>
            <CopyButton value={secretLink} ariaLabel="Copy request link" size="sm" />
          </div>
          {linkExpiresAt && (
            <div className="border-t border-border px-3 py-2 text-2xs text-muted">
              Accepts a secret until {linkExpiresAt}
            </div>
          )}
        </div>

        <Button
          variant="project"
          size="lg"
          isFullWidth
          onClick={() => {
            setSecretLink("");
            setLinkExpiresAt(null);
          }}
        >
          Request Another Secret
          <ReplyIcon />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <FieldGroup>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="request-secret-name">
                Name <span className="text-xs text-muted italic">- Optional</span>
              </FieldLabel>
              <Input
                {...field}
                id="request-secret-name"
                placeholder="API Key"
                type="text"
                isError={Boolean(error)}
              />
              <FieldDescription>
                Only visible to your organization, never to the sender.
              </FieldDescription>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />

        <Controller
          control={control}
          name="expiresIn"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="request-secret-expires-in">
                Expires In
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3 cursor-help text-muted" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Once the link expires no one can submit a secret through it. A secret submitted
                    before then stays available to you.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select value={field.value} onValueChange={(e) => onChange(e)}>
                <SelectTrigger className="w-full" id="request-secret-expires-in">
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
              {resolvedExpiry && (
                <FieldDescription>
                  The link stops accepting a secret on {resolvedExpiry}.
                </FieldDescription>
              )}
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
              <FieldLabel htmlFor="request-secret-access-type">Who Can Respond</FieldLabel>
              <Select value={field.value} onValueChange={(e) => onChange(e)}>
                <SelectTrigger className="w-full" id="request-secret-access-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SecretSharingAccessType.Anyone}>Anyone</SelectItem>
                  <SelectItem value={SecretSharingAccessType.Organization}>
                    People within your organization
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Restricting to your organization requires the sender to sign in to Infisical.
              </FieldDescription>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />

        <div className="flex w-full justify-end">
          <Button
            variant="project"
            type="submit"
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            Create Request Link
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
};
