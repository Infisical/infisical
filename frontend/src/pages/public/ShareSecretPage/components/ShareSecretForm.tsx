import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import { Check, ClipboardCheck, Copy, ForwardIcon, Info, Lock } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
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
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { useCreatePublicSharedSecret, useCreateSharedSecret } from "@app/hooks/api";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing";
import { ms } from "@app/lib/fn/time";

// values in ms
const expiresInOptions = [
  { label: "5 min", value: "5m" },
  { label: "30 min", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" }
];

const viewLimitOptions = [
  { label: "Unlimited", value: false },
  { label: "Limited", value: true }
];

const schema = z.object({
  name: z.string().optional(),
  password: z.string().optional(),
  secret: z.string().min(1),
  expiresIn: z.string(),
  viewLimit: z.string(),
  shouldLimitView: z.boolean(),
  accessType: z.nativeEnum(SecretSharingAccessType).optional(),
  emails: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const emails = val
          .split(",")
          .map((email) => email.trim())
          .filter((email) => email !== "");
        if (emails.length > 100) return false;
        return emails.every((email) => z.string().email().safeParse(email).success);
      },
      {
        message: "Must be a comma-separated list of valid emails (max 100) or empty."
      }
    ),
  allowExternalEmails: z.boolean().optional()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  isPublic: boolean; // whether or not this is a public (non-authenticated) secret sharing form
  value?: string;
  allowSecretSharingOutsideOrganization?: boolean;
  maxSharedSecretLifetime?: number;
  maxSharedSecretViewLimit?: number | null;
};

export const ShareSecretForm = ({
  isPublic,
  value,
  allowSecretSharingOutsideOrganization = true,
  maxSharedSecretLifetime,
  maxSharedSecretViewLimit
}: Props) => {
  const [secretLink, setSecretLink] = useState<string | null>(null);
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });
  const subOrganization = useSearch({
    strict: false,
    select: (el) => el?.subOrganization
  });

  const publicSharedSecretCreator = useCreatePublicSharedSecret();
  const privateSharedSecretCreator = useCreateSharedSecret();
  const createSharedSecret = isPublic ? publicSharedSecretCreator : privateSharedSecretCreator;

  // Note: maxSharedSecretLifetime is in seconds
  const filteredExpiresInOptions = maxSharedSecretLifetime
    ? expiresInOptions.filter((v) => ms(v.value) / 1000 <= maxSharedSecretLifetime)
    : expiresInOptions;

  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting },
    watch
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      secret: value || "",
      viewLimit: maxSharedSecretViewLimit?.toString() ?? "1",
      shouldLimitView: Boolean(maxSharedSecretViewLimit),
      expiresIn:
        filteredExpiresInOptions[Math.min(filteredExpiresInOptions.length - 1, 2)].value.toString()
    }
  });

  const isLimitingView = watch("shouldLimitView");
  const isAllowingExternalEmails = watch("allowExternalEmails");
  const accessType = watch("accessType");

  const isOrgAccess =
    accessType === SecretSharingAccessType.Organization || !allowSecretSharingOutsideOrganization;

  const onFormSubmit = async ({
    name,
    password,
    secret,
    expiresIn,
    viewLimit,
    accessType: formAccessType,
    emails,
    shouldLimitView,
    allowExternalEmails
  }: FormData) => {
    const processedEmails = emails ? emails.split(",").map((e) => e.trim()) : undefined;

    const { id } = await createSharedSecret.mutateAsync({
      name,
      password,
      secretValue: secret,
      expiresIn,
      maxViews: shouldLimitView ? Number(viewLimit) : undefined,
      accessType: formAccessType,
      authorizedEmails: processedEmails,
      allowExternalEmails
    });

    if (processedEmails && processedEmails.length > 0) {
      setSecretLink("");

      const showAccountRequiredMessage = !allowExternalEmails && !isOrgAccess;

      createNotification({
        text: showAccountRequiredMessage
          ? `If the provided ${processedEmails.length > 1 ? "emails are" : "email is"} associated with an Infisical account they will receive a link`
          : `Secret link has been sent to the provided ${processedEmails.length > 1 ? "emails" : "email"}`,
        type: "success"
      });
    } else {
      const link = new URL(`${window.location.origin}/shared/secret/${id}`);
      if (subOrganization) {
        link.searchParams.set("subOrganization", subOrganization);
      }

      setSecretLink(link.toString());

      navigator.clipboard.writeText(link.toString());
      setCopyTextSecret("secret");

      createNotification({
        text: "Shared secret link copied to clipboard.",
        type: "success"
      });
    }

    reset();
  };

  if (secretLink === null)
    return (
      <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
        {!isPublic && (
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>
                  Name <span className="text-xs text-muted italic">- Optional</span>
                </FieldLabel>
                <Input
                  {...field}
                  placeholder="API Key"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  isError={Boolean(error)}
                />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
        )}
        <Controller
          control={control}
          name="secret"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Your Secret</FieldLabel>
              <TextArea
                placeholder="Enter sensitive data to share via an encrypted link"
                {...field}
                className={twMerge("min-h-[70px] resize-none", isPublic ? "h-40" : "h-14")}
                disabled={value !== undefined}
                aria-invalid={Boolean(error)}
              />
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Password <span className="text-xs text-muted italic">- Optional</span>
              </FieldLabel>
              <Input
                {...field}
                placeholder="Password"
                type="password"
                autoComplete="new-password"
                autoCorrect="off"
                spellCheck={false}
                aria-autocomplete="none"
                data-form-type="other"
                isError={Boolean(error)}
              />
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />

        {!isPublic && (
          <Controller
            control={control}
            name="accessType"
            defaultValue={SecretSharingAccessType.Organization}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field orientation="horizontal">
                <Switch
                  checked={
                    field.value === SecretSharingAccessType.Organization ||
                    !allowSecretSharingOutsideOrganization
                  }
                  variant="org"
                  disabled={!allowSecretSharingOutsideOrganization}
                  onCheckedChange={(v) =>
                    onChange(
                      v ? SecretSharingAccessType.Organization : SecretSharingAccessType.Anyone
                    )
                  }
                />
                <FieldLabel className="flex-auto">
                  <span className="flex items-center">
                    Limit access to people within organization
                    {!allowSecretSharingOutsideOrganization && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="ml-2 size-3 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent>Enforced by your organization</TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </FieldLabel>
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
        )}

        <Accordion type="single" collapsible variant="ghost">
          <AccordionItem value="advance-settings">
            <AccordionTrigger>Advanced Settings</AccordionTrigger>
            <AccordionContent className="flex flex-col gap-y-4">
              <Controller
                control={control}
                name="expiresIn"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel>Expires In</FieldLabel>
                    <Select value={field.value} onValueChange={(e) => onChange(e)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {expiresInOptions.map(({ label, value: expiresInValue }) => (
                          <SelectItem
                            value={String(expiresInValue || "")}
                            key={label}
                            disabled={!filteredExpiresInOptions.some((v) => v.label === label)}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {expiresInOptions.length !== filteredExpiresInOptions.length && (
                      <FieldDescription className="text-info">
                        Limited to{" "}
                        {filteredExpiresInOptions[filteredExpiresInOptions.length - 1].label} by
                        organization
                      </FieldDescription>
                    )}
                    {error && <FieldError>{error.message}</FieldError>}
                  </Field>
                )}
              />
              <div className="flex w-full items-end gap-2 overflow-visible">
                {maxSharedSecretViewLimit === null && (
                  <Controller
                    control={control}
                    name="shouldLimitView"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field className="flex-1">
                        <FieldLabel>Max Views</FieldLabel>
                        <Select
                          value={field.value.toString()}
                          onValueChange={(e) => onChange(e === "true")}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {viewLimitOptions.map(({ label, value: viewLimitValue }) => (
                              <SelectItem
                                value={viewLimitValue.toString()}
                                key={viewLimitValue.toString()}
                              >
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {error && <FieldError>{error.message}</FieldError>}
                      </Field>
                    )}
                  />
                )}
                {isLimitingView && (
                  <Controller
                    control={control}
                    name="viewLimit"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {maxSharedSecretViewLimit && <FieldLabel>Max Views</FieldLabel>}
                        <Input
                          onChange={onChange}
                          {...field}
                          min={1}
                          max={maxSharedSecretViewLimit ?? 1000}
                          type="number"
                          isError={Boolean(error)}
                        />
                        {maxSharedSecretViewLimit && (
                          <FieldDescription className="text-info">
                            Limited to {maxSharedSecretViewLimit} view
                            {maxSharedSecretViewLimit === 1 ? "" : "s"} by organization
                          </FieldDescription>
                        )}
                        {error && <FieldError>{error.message}</FieldError>}
                      </Field>
                    )}
                  />
                )}
              </div>
              {!isPublic && (
                <>
                  <Controller
                    control={control}
                    name="emails"
                    render={({ field, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel>
                          Emails <span className="text-xs text-muted italic">- Optional</span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="size-3 cursor-help text-muted" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p>
                                Unique secret links will be emailed to each individual. The secret
                                will only be accessible to those links.
                              </p>
                              <p className="mt-2">
                                {isAllowingExternalEmails
                                  ? "External recipients (user without an Infisical account) will need the password to view the secret. Authorized recipients will also need a password if the secret is password-protected."
                                  : "Recipients must have an Infisical account to verify their identity."}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </FieldLabel>
                        <Input
                          {...field}
                          placeholder="user1@example.com, user2@example.com"
                          autoComplete="off"
                          isError={Boolean(error)}
                        />
                        <FieldDescription>
                          {isAllowingExternalEmails
                            ? "All recipients will receive a link and need the password to access the secret. They don't need an Infisical account, but a password is mandatory in this case."
                            : "Recipients must have an Infisical account to verify identity"}
                        </FieldDescription>
                        {error && <FieldError>{error.message}</FieldError>}
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="allowExternalEmails"
                    render={({
                      field: { onChange, value: isChecked, ...field },
                      fieldState: { error }
                    }) => (
                      <Field orientation="horizontal">
                        <Switch
                          checked={isOrgAccess ? false : (isChecked ?? false)}
                          onCheckedChange={onChange}
                          variant="org"
                          disabled={isOrgAccess}
                          id="allow-external-emails"
                          {...field}
                        />
                        <FieldLabel className="flex-auto">
                          <span className="flex items-center">
                            Allow external recipients
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="ml-2 size-3 cursor-help text-muted" />
                              </TooltipTrigger>
                              <TooltipContent>
                                When enabled, the defined emails will receive the secret link via
                                email but will need the password to access the secret.
                              </TooltipContent>
                            </Tooltip>
                            {!allowSecretSharingOutsideOrganization && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Lock className="ml-2 size-3 text-muted" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  External sharing is disabled by your organization
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        </FieldLabel>
                        {error && <FieldError>{error.message}</FieldError>}
                      </Field>
                    )}
                  />
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="flex w-full justify-end">
          {isPublic && (
            <Badge variant="ghost" className="mt-auto mr-auto">
              <img
                src="/images/logotransparent_trimmed.png"
                alt="Infisical"
                className="mr-0.5 h-[8px]"
              />
              Powered by Infisical
            </Badge>
          )}
          <Button
            size="md"
            variant={isPublic ? "project" : "org"}
            type="submit"
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            Create Secret Link
          </Button>
        </div>
      </form>
    );

  if (secretLink === "")
    return (
      <>
        <div className="relative flex items-center justify-center rounded-lg border border-border bg-container p-4 pr-6 text-foreground/85">
          <Check className="mr-2 size-4 text-success" />
          <span>Shared secret link has been emailed to select users.</span>
        </div>
        <Button
          className="w-full"
          variant={isPublic ? "project" : "org"}
          size="lg"
          onClick={() => setSecretLink(null)}
        >
          Share Another Secret
          <ForwardIcon />
        </Button>
      </>
    );

  return (
    <>
      <div className="relative flex items-center justify-between rounded-md border border-border bg-container p-2 pr-5 pl-3 text-base text-label">
        <p className="mr-4 break-all">{secretLink}</p>
        <IconButton
          aria-label="copy icon"
          variant="ghost-muted"
          size="sm"
          className="absolute top-1 right-1"
          onClick={() => {
            navigator.clipboard.writeText(secretLink || "");
            setCopyTextSecret("Copied");
          }}
        >
          {isCopyingSecret ? <ClipboardCheck className="size-4" /> : <Copy className="size-4" />}
        </IconButton>
      </div>
      <Button
        className="w-full"
        variant={isPublic ? "project" : "org"}
        size="lg"
        onClick={() => setSecretLink(null)}
      >
        Share Another Secret
        <ForwardIcon />
      </Button>
    </>
  );
};
