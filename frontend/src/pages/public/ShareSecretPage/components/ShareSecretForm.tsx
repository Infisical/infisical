import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  FormControl,
  Input,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
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
    )
});

export type FormData = z.infer<typeof schema>;

type Props = {
  isPublic: boolean;
  value?: string;
  allowSecretSharingOutsideOrganization?: boolean;
  maxSharedSecretLifetime?: number;
  maxSharedSecretViewLimit?: number | null;
  onStateChange?: (state: "form" | "link" | "emailed") => void;
};

export const ShareSecretForm = ({
  isPublic,
  value,
  allowSecretSharingOutsideOrganization = true,
  maxSharedSecretLifetime,
  maxSharedSecretViewLimit,
  onStateChange
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

  const onFormSubmit = async ({
    name,
    password,
    secret,
    expiresIn,
    viewLimit,
    accessType,
    emails,
    shouldLimitView
  }: FormData) => {
    const processedEmails = emails ? emails.split(",").map((e) => e.trim()) : undefined;

    const { id } = await createSharedSecret.mutateAsync({
      name,
      password,
      secretValue: secret,
      expiresIn,
      maxViews: shouldLimitView ? Number(viewLimit) : undefined,
      accessType,
      authorizedEmails: processedEmails
    });

    if (processedEmails && processedEmails.length > 0) {
      setSecretLink("");
      onStateChange?.("emailed");
      createNotification({
        text: `Shared secret link emailed to ${processedEmails.length} user(s).`,
        type: "success"
      });
    } else {
      const link = new URL(`${window.location.origin}/shared/secret/${id}`);
      if (subOrganization) {
        link.searchParams.set("subOrganization", subOrganization);
      }

      setSecretLink(link.toString());
      onStateChange?.("link");

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
      <form onSubmit={handleSubmit(onFormSubmit)}>
        {!isPublic && (
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isOptional
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input
                  {...field}
                  placeholder="API Key"
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
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
                className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5 text-bunker-300 outline-hidden transition-all group-hover:mr-2 placeholder:text-mineshaft-400 hover:border-primary-400/30 focus:border-primary-400/50"
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
              <Input
                {...field}
                placeholder="Password"
                type="password"
                autoComplete="new-password"
                autoCorrect="off"
                spellCheck="false"
                aria-autocomplete="none"
                data-form-type="other"
              />
            </FormControl>
          )}
        />

        {!isPublic && (
          <Controller
            control={control}
            name="accessType"
            defaultValue={SecretSharingAccessType.Organization}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                helperText={
                  allowSecretSharingOutsideOrganization ? undefined : (
                    <span className="text-red-500">Feature enforced by organization</span>
                  )
                }
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Switch
                  className={`mr-2 ml-0 bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-primary ${!allowSecretSharingOutsideOrganization ? "opacity-50" : ""}`}
                  thumbClassName="bg-mineshaft-800"
                  containerClassName="flex-row-reverse w-fit"
                  isChecked={
                    field.value === SecretSharingAccessType.Organization ||
                    !allowSecretSharingOutsideOrganization
                  }
                  isDisabled={!allowSecretSharingOutsideOrganization}
                  onCheckedChange={(v) =>
                    onChange(
                      v ? SecretSharingAccessType.Organization : SecretSharingAccessType.Anyone
                    )
                  }
                  id="org-access-only"
                >
                  Limit access to people within organization
                </Switch>
              </FormControl>
            )}
          />
        )}

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="advance-settings" className="data-[state=open]:border-none">
            <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
              <div className="order-1 ml-3">Advanced Settings</div>
            </AccordionTrigger>
            <AccordionContent childrenClassName="p-0">
              <Controller
                control={control}
                name="expiresIn"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Expires In"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    helperText={
                      expiresInOptions.length !== filteredExpiresInOptions.length ? (
                        <span className="text-yellow-500">
                          Limited to{" "}
                          {filteredExpiresInOptions[filteredExpiresInOptions.length - 1].label} by
                          organization
                        </span>
                      ) : undefined
                    }
                  >
                    <Select
                      defaultValue={field.value}
                      {...field}
                      onValueChange={(e) => onChange(e)}
                      className="w-full"
                    >
                      {expiresInOptions.map(({ label, value: expiresInValue }) => (
                        <SelectItem
                          value={String(expiresInValue || "")}
                          key={label}
                          isDisabled={!filteredExpiresInOptions.some((v) => v.label === label)}
                        >
                          {label}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
              <div className="flex w-full items-end gap-2">
                {maxSharedSecretViewLimit === null && (
                  <Controller
                    control={control}
                    name="shouldLimitView"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label="Max Views"
                        errorText={error?.message}
                        isError={Boolean(error)}
                        className="flex-1"
                      >
                        <Select
                          defaultValue={field.value.toString()}
                          onValueChange={(e) => onChange(e === "true")}
                          className="w-full"
                          position="popper"
                          {...field}
                          value={field.value.toString()}
                          dropdownContainerClassName="max-w-none"
                        >
                          {viewLimitOptions.map(({ label, value: viewLimitValue }) => (
                            <SelectItem
                              value={viewLimitValue.toString()}
                              key={viewLimitValue.toString()}
                            >
                              {label}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                )}
                {isLimitingView && (
                  <Controller
                    control={control}
                    name="viewLimit"
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                      <FormControl
                        label={maxSharedSecretViewLimit ? "Max Views" : undefined}
                        errorText={error?.message}
                        isError={Boolean(error)}
                        className="flex-1"
                        helperText={
                          maxSharedSecretViewLimit ? (
                            <span className="text-yellow-500">
                              Limited to {maxSharedSecretViewLimit} view
                              {maxSharedSecretViewLimit === 1 ? "" : "s"} by organization
                            </span>
                          ) : undefined
                        }
                      >
                        <Input
                          onChange={onChange}
                          {...field}
                          min={1}
                          max={maxSharedSecretViewLimit ?? 1000}
                          type="number"
                          className="h-[37px]"
                        />
                      </FormControl>
                    )}
                  />
                )}
              </div>
              {!isPublic && (
                <Controller
                  control={control}
                  name="emails"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Authorized Emails"
                      isOptional
                      helperText="Recipients must have an Infisical account to verify identity"
                      tooltipText={
                        <>
                          <p>
                            Unique secret links will be emailed to each individual. The secret will
                            only be accessible to those links.
                          </p>
                          <p className="mt-2">
                            Recipients must have an Infisical account to verify their identity.
                          </p>
                        </>
                      }
                      tooltipClassName="max-w-sm"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        {...field}
                        placeholder="user1@example.com, user2@example.com"
                        autoComplete="off"
                      />
                    </FormControl>
                  )}
                />
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-4 flex w-full items-center justify-between">
          <a
            href="https://infisical.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-mineshaft-500 bg-mineshaft-700 px-2.5 py-1 text-[11px] text-mineshaft-300 transition-colors hover:border-mineshaft-400 hover:text-white"
          >
            <img src="/images/gradientLogo.svg" alt="" className="size-4" />
            Powered by Infisical
          </a>
          <button
            type="submit"
            disabled={isSubmitting}
            className="cursor-pointer rounded-md border border-primary/60 bg-primary/10 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:border-primary hover:bg-primary/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Secret Link"}
          </button>
        </div>
      </form>
    );

  if (secretLink === "")
    return (
      <div className="flex flex-col items-center py-2">
        <FontAwesomeIcon icon={faCheck} className="text-lg text-green-400" />
        <p className="mt-3 text-sm text-white">Shared secret link has been emailed.</p>
        <button
          type="button"
          className="mt-4 cursor-pointer text-xs text-mineshaft-400 transition-colors hover:text-mineshaft-300 hover:underline"
          onClick={() => { setSecretLink(null); onStateChange?.("form"); }}
        >
          Share another secret
        </button>
      </div>
    );

  return (
    <div className="flex flex-col items-center py-2">
      <div className="mb-4 w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-2.5">
        <p className="break-all font-mono text-xs text-mineshaft-200">{secretLink}</p>
      </div>
      <button
        type="button"
        className="w-full cursor-pointer rounded-md border border-mineshaft-500 bg-mineshaft-700/50 px-4 py-2 text-sm font-medium text-mineshaft-200 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-white"
        onClick={() => {
          navigator.clipboard.writeText(secretLink || "");
          setCopyTextSecret("Copied");
        }}
      >
        <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} className="mr-2" />
        {isCopyingSecret ? "Copied" : "Copy secret link"}
      </button>
      <button
        type="button"
        className="mt-4 cursor-pointer text-xs text-mineshaft-400 transition-colors hover:text-mineshaft-300 hover:underline"
        onClick={() => { setSecretLink(null); onStateChange?.("form"); }}
      >
        Share another secret
      </button>
    </div>
  );
};
