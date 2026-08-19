import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckCircle2, Eye, EyeOff, ForwardIcon, Info, Lock, MailCheck } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  CopyButton,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
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
import { useToggle } from "@app/hooks";
import { useCreatePublicSharedSecret, useCreateSharedSecret } from "@app/hooks/api";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing";
import { ms } from "@app/lib/fn/time";

const expiresInOptions = [
  { label: "5 minutes", value: "5m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" }
];

const MAX_RECIPIENTS = 100;
const ABSOLUTE_VIEW_CEILING = 1000;

const parseRecipients = (emails?: string) =>
  emails
    ? emails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)
    : [];

const baseSchema = z.object({
  name: z.string().optional(),
  password: z.string().optional(),
  secret: z.string().min(1, "Enter the value you want to share."),
  expiresIn: z.string(),
  viewLimit: z.string(),
  shouldLimitView: z.boolean(),
  accessType: z.nativeEnum(SecretSharingAccessType).optional(),
  emails: z
    .string()
    .optional()
    .refine(
      (val) => {
        const recipients = parseRecipients(val);
        if (recipients.length > MAX_RECIPIENTS) return false;
        return recipients.every((email) => z.string().email().safeParse(email).success);
      },
      {
        message: `Enter up to ${MAX_RECIPIENTS} valid emails, separated by commas.`
      }
    ),
  allowExternalEmails: z.boolean().optional()
});

export type FormData = z.infer<typeof baseSchema>;

const buildSchema = (maxSharedSecretViewLimit?: number | null) =>
  baseSchema.superRefine((data, ctx) => {
    if (data.shouldLimitView) {
      const views = Number(data.viewLimit);
      const ceiling = maxSharedSecretViewLimit ?? ABSOLUTE_VIEW_CEILING;

      if (!Number.isInteger(views) || views < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["viewLimit"],
          message: "Enter a whole number of views, 1 or greater."
        });
      } else if (views > ceiling) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["viewLimit"],
          message: `Enter at most ${ceiling} view${ceiling === 1 ? "" : "s"}.`
        });
      }
    }

    if (data.allowExternalEmails && parseRecipients(data.emails).length > 0 && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "External recipients need a password to open the secret."
      });
    }
  });

type ShareResult =
  | { kind: "link"; url: string; expiresAt: string; views: string }
  | { kind: "email"; recipientCount: number; requiresAccount: boolean };

const describeResult = (result: ShareResult) => {
  if (result.kind === "link") {
    return "The link is copied to your clipboard. It cannot be recovered from the secret value again.";
  }

  const plural = result.recipientCount === 1 ? "" : "s";

  if (result.requiresAccount) {
    return `Sent to ${result.recipientCount} recipient${plural}. Only those with an Infisical account will receive a link.`;
  }

  return `Sent to ${result.recipientCount} recipient${plural}. Each one receives a unique link.`;
};

const formatExpiry = (expiresIn: string) => {
  try {
    return format(new Date(Date.now() + ms(expiresIn)), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return null;
  }
};

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
  const [result, setResult] = useState<ShareResult | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useToggle(false);
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

  const isLifetimeCapped = expiresInOptions.length !== filteredExpiresInOptions.length;
  const isViewLimitEnforced = Boolean(maxSharedSecretViewLimit);

  const schema = useMemo(() => buildSchema(maxSharedSecretViewLimit), [maxSharedSecretViewLimit]);

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
      shouldLimitView: isViewLimitEnforced,
      accessType: isPublic ? undefined : SecretSharingAccessType.Organization,
      expiresIn:
        filteredExpiresInOptions[Math.min(filteredExpiresInOptions.length - 1, 2)].value.toString()
    }
  });

  const isLimitingView = watch("shouldLimitView");
  const isAllowingExternalEmails = watch("allowExternalEmails");
  const accessType = watch("accessType");
  const selectedExpiresIn = watch("expiresIn");

  const isOrgAccess =
    accessType === SecretSharingAccessType.Organization || !allowSecretSharingOutsideOrganization;

  const resolvedExpiry = formatExpiry(selectedExpiresIn);

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
    const recipients = parseRecipients(emails);

    const { id } = await createSharedSecret.mutateAsync({
      name,
      password,
      secretValue: secret,
      expiresIn,
      maxViews: shouldLimitView ? Number(viewLimit) : undefined,
      accessType: formAccessType,
      authorizedEmails: recipients.length ? recipients : undefined,
      allowExternalEmails
    });

    if (recipients.length > 0) {
      const requiresAccount = !allowExternalEmails && !isOrgAccess;

      setResult({ kind: "email", recipientCount: recipients.length, requiresAccount });

      createNotification({
        text: requiresAccount
          ? `If the provided ${recipients.length > 1 ? "emails are" : "email is"} associated with an Infisical account they will receive a link`
          : `Secret link has been sent to the provided ${recipients.length > 1 ? "emails" : "email"}`,
        type: "success"
      });
    } else {
      const link = new URL(`${window.location.origin}/shared/secret/${id}`);
      if (subOrganization) {
        link.searchParams.set("subOrganization", subOrganization);
      }

      setResult({
        kind: "link",
        url: link.toString(),
        expiresAt: formatExpiry(expiresIn) ?? "",
        views: shouldLimitView ? viewLimit : "Unlimited"
      });

      try {
        await navigator.clipboard.writeText(link.toString());
        createNotification({
          text: "Shared secret link copied to clipboard.",
          type: "success"
        });
      } catch {
        createNotification({
          text: "Secret link created. Copy it below, your browser blocked clipboard access.",
          type: "info"
        });
      }
    }

    reset();
  };

  if (result !== null) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5">
          {result.kind === "link" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <MailCheck className="mt-0.5 size-4 shrink-0 text-success" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {result.kind === "link" ? "Secret Link Created" : "Secret Link Sent"}
            </p>
            <p className="mt-0.5 text-xs text-accent">{describeResult(result)}</p>
          </div>
        </div>

        {result.kind === "link" && (
          <div className="rounded-md border border-border bg-container">
            <div className="flex items-start justify-between gap-2 p-3">
              <p className="min-w-0 font-mono text-xs break-all text-label">{result.url}</p>
              <CopyButton value={result.url} ariaLabel="Copy secret link" size="sm" />
            </div>
            {(result.expiresAt || result.views) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-2 text-2xs text-muted">
                {result.expiresAt && <span>Expires {result.expiresAt}</span>}
                <span>
                  {result.views === "Unlimited"
                    ? "Unlimited views"
                    : `${result.views} view${result.views === "1" ? "" : "s"}`}
                </span>
              </div>
            )}
          </div>
        )}

        <Button variant="project" size="lg" isFullWidth onClick={() => setResult(null)}>
          Share Another Secret
          <ForwardIcon />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <FieldGroup>
        <FieldSet>
          {!isPublic && (
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="share-secret-name">
                    Name <span className="text-xs text-muted italic">- Optional</span>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="share-secret-name"
                    placeholder="API Key"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    isError={Boolean(error)}
                  />
                  <FieldDescription>
                    Only visible to your organization, never to the recipient.
                  </FieldDescription>
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
                <FieldLabel htmlFor="share-secret-value">Secret Value</FieldLabel>
                <TextArea
                  placeholder="Enter sensitive data to share via an encrypted link"
                  {...field}
                  id="share-secret-value"
                  className={twMerge("min-h-[70px] resize-y", isPublic ? "h-40" : "h-24")}
                  disabled={value !== undefined}
                  aria-invalid={Boolean(error)}
                />
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
        </FieldSet>

        <FieldSeparator />

        <FieldSet>
          <FieldLegend variant="label">Access</FieldLegend>
          <Controller
            control={control}
            name="expiresIn"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="share-secret-expires-in">Expires In</FieldLabel>
                <Select value={field.value} onValueChange={(e) => onChange(e)}>
                  <SelectTrigger className="w-full" id="share-secret-expires-in">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expiresInOptions.map(({ label, value: expiresInValue }) => {
                      const isAvailable = filteredExpiresInOptions.some((v) => v.label === label);

                      return (
                        <SelectItem
                          value={String(expiresInValue || "")}
                          key={label}
                          disabled={!isAvailable}
                        >
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {resolvedExpiry ? `The link stops working on ${resolvedExpiry}.` : null}
                  {isLifetimeCapped && (
                    <span className="mt-0.5 block text-info">
                      Your organization caps links at{" "}
                      {filteredExpiresInOptions[filteredExpiresInOptions.length - 1].label}.
                    </span>
                  )}
                </FieldDescription>
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />

          {!isPublic && !isViewLimitEnforced && (
            <Controller
              control={control}
              name="shouldLimitView"
              render={({ field: { onChange, value: isChecked, ...field } }) => (
                <Field orientation="horizontal">
                  <Switch
                    {...field}
                    variant="project"
                    id="share-secret-limit-views"
                    checked={isChecked}
                    onCheckedChange={onChange}
                  />
                  <FieldLabel htmlFor="share-secret-limit-views" className="flex-auto">
                    Limit how many times it can be viewed
                  </FieldLabel>
                </Field>
              )}
            />
          )}

          {!isPublic && isLimitingView && (
            <Controller
              control={control}
              name="viewLimit"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="share-secret-view-limit">
                    Maximum Views
                    {isViewLimitEnforced && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Lock className="size-3 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent>Enforced by your organization</TooltipContent>
                      </Tooltip>
                    )}
                  </FieldLabel>
                  <Input
                    onChange={onChange}
                    {...field}
                    id="share-secret-view-limit"
                    min={1}
                    max={maxSharedSecretViewLimit ?? ABSOLUTE_VIEW_CEILING}
                    type="number"
                    isError={Boolean(error)}
                  />
                  {isViewLimitEnforced && (
                    <FieldDescription className="text-info">
                      Your organization caps links at {maxSharedSecretViewLimit} view
                      {maxSharedSecretViewLimit === 1 ? "" : "s"}.
                    </FieldDescription>
                  )}
                  {error && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
          )}

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="share-secret-password">
                  Password <span className="text-xs text-muted italic">- Optional</span>
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    {...field}
                    id="share-secret-password"
                    placeholder="Password"
                    type={isPasswordVisible ? "text" : "password"}
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-autocomplete="none"
                    data-form-type="other"
                    aria-invalid={Boolean(error)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      onClick={() => setIsPasswordVisible.toggle()}
                      aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    >
                      {isPasswordVisible ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  Recipients must enter this password before the secret is revealed.
                </FieldDescription>
                {error && <FieldError>{error.message}</FieldError>}
              </Field>
            )}
          />
        </FieldSet>

        {!isPublic && (
          <>
            <FieldSeparator />

            <FieldSet>
              <FieldLegend variant="label">Delivery</FieldLegend>
              <Controller
                control={control}
                name="accessType"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <Field orientation="horizontal">
                    <Switch
                      variant="project"
                      id="share-secret-org-only"
                      checked={
                        field.value === SecretSharingAccessType.Organization ||
                        !allowSecretSharingOutsideOrganization
                      }
                      disabled={!allowSecretSharingOutsideOrganization}
                      onCheckedChange={(v) =>
                        onChange(
                          v ? SecretSharingAccessType.Organization : SecretSharingAccessType.Anyone
                        )
                      }
                    />
                    <FieldLabel htmlFor="share-secret-org-only" className="flex-auto">
                      Limit access to people within organization
                      {!allowSecretSharingOutsideOrganization && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Lock className="size-3 text-muted" />
                          </TooltipTrigger>
                          <TooltipContent>Enforced by your organization</TooltipContent>
                        </Tooltip>
                      )}
                    </FieldLabel>
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
                      {...field}
                      variant="project"
                      id="share-secret-allow-external"
                      checked={isOrgAccess ? false : (isChecked ?? false)}
                      onCheckedChange={onChange}
                      disabled={isOrgAccess}
                    />
                    <FieldLabel htmlFor="share-secret-allow-external" className="flex-auto">
                      Allow recipients without an Infisical account
                      {!allowSecretSharingOutsideOrganization && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Lock className="size-3 text-muted" />
                          </TooltipTrigger>
                          <TooltipContent>
                            External sharing is disabled by your organization
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </FieldLabel>
                    {error && <FieldError>{error.message}</FieldError>}
                  </Field>
                )}
              />

              <Controller
                control={control}
                name="emails"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="share-secret-emails">
                      Email Recipients <span className="text-xs text-muted italic">- Optional</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="size-3 cursor-help text-muted" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          Each recipient gets their own link. Leave this empty to get one link you
                          can share yourself.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="share-secret-emails"
                      placeholder="user1@example.com, user2@example.com"
                      autoComplete="off"
                      isError={Boolean(error)}
                    />
                    <FieldDescription>
                      {isAllowingExternalEmails
                        ? "Recipients do not need an Infisical account, but they do need the password above."
                        : "Recipients must sign in to Infisical so their identity can be verified."}
                    </FieldDescription>
                    {error && <FieldError>{error.message}</FieldError>}
                  </Field>
                )}
              />
            </FieldSet>
          </>
        )}

        <div className="flex w-full items-center justify-end gap-2">
          {isPublic && (
            <Badge variant="ghost" className="mr-auto">
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
            variant="project"
            type="submit"
            isPending={isSubmitting}
            isDisabled={isSubmitting}
          >
            Create Secret Link
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
};
