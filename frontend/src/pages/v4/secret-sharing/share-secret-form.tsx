import { type ReactNode, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import { Button } from "@infisical/cipher/ui/button";
import { Field, FieldLabel } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";
import ms from "ms";

import { EMAIL_LIST_DELIMITER, isValidEmail } from "@app/helpers/email";
import type {
  TCreatedSharedSecret,
  TCreateSharedSecretRequest
} from "@app/hooks/api/secretSharing/types";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing/types";

import { toast } from "../access/toast";
import { LinkResult, sharedSecretLink, writeLink } from "./links";

import styles from "./secret-sharing.module.css";

export const EXPIRES_IN_OPTIONS = [
  { label: "5 minutes", value: "5m" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "14 days", value: "14d" },
  { label: "30 days", value: "30d" }
];
const ABSOLUTE_VIEW_CEILING = 1000;
const MAX_RECIPIENTS = 100;

export const formatExpiry = (expiresIn: string) =>
  format(new Date(Date.now() + ms(expiresIn)), "MMM d, yyyy 'at' h:mm a");

type Result =
  | { kind: "link"; url: string; expiresAt: string; views: string }
  | { kind: "email"; recipients: number; requiresAccount: boolean };

export type ShareSecretFormProps = {
  isPublic: boolean;
  create: { mutateAsync: (dto: TCreateSharedSecretRequest) => Promise<TCreatedSharedSecret> };
  allowSecretSharingOutsideOrganization?: boolean;
  maxSharedSecretLifetime?: number;
  maxSharedSecretViewLimit?: number | null;
  subOrganization?: string;
  formId: string;
};

export const useShareSecretForm = ({
  isPublic,
  create,
  allowSecretSharingOutsideOrganization = true,
  maxSharedSecretLifetime,
  maxSharedSecretViewLimit,
  subOrganization,
  formId
}: ShareSecretFormProps) => {
  const available = maxSharedSecretLifetime
    ? EXPIRES_IN_OPTIONS.filter((option) => ms(option.value) / 1000 <= maxSharedSecretLifetime)
    : EXPIRES_IN_OPTIONS;
  const isLifetimeCapped = available.length !== EXPIRES_IN_OPTIONS.length;
  const isViewLimitEnforced = Boolean(maxSharedSecretViewLimit);
  const viewCeiling = maxSharedSecretViewLimit ?? ABSOLUTE_VIEW_CEILING;
  const blank = {
    name: "",
    secret: "",
    expiresIn: available[Math.min(available.length - 1, 2)]?.value ?? "1h",
    shouldLimitView: isViewLimitEnforced,
    viewLimit: maxSharedSecretViewLimit?.toString() ?? "1",
    password: "",
    orgOnly: !isPublic,
    allowExternalEmails: false,
    emails: ""
  };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(blank);
  const patch = (next: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...next }));
    setErrors({});
  };
  const isOrgAccess = !isPublic && (form.orgOnly || !allowSecretSharingOutsideOrganization);
  const recipients = isPublic
    ? []
    : form.emails
        .split(EMAIL_LIST_DELIMITER)
        .map((email) => email.trim())
        .filter(Boolean);
  const constraints = [
    form.shouldLimitView,
    Boolean(form.password),
    isOrgAccess,
    !form.allowExternalEmails && recipients.length > 0
  ].filter(Boolean).length;

  const reset = () => {
    setForm(blank);
    setErrors({});
    setResult(undefined);
  };

  const submit = async () => {
    const issues: Record<string, string> = {};
    if (form.name.length > 50) issues.name = "Name must be 50 characters or fewer.";
    if (!form.secret) issues.secret = "Enter the value you want to share.";
    if (form.shouldLimitView) {
      const views = Number(form.viewLimit);
      if (!Number.isInteger(views) || views < 1)
        issues.viewLimit = "Enter a whole number of views, 1 or greater.";
      else if (views > viewCeiling)
        issues.viewLimit = `Enter at most ${viewCeiling} view${viewCeiling === 1 ? "" : "s"}.`;
    }
    const invalid = recipients.filter((email) => !isValidEmail(email));
    if (invalid.length) issues.emails = `Enter valid email addresses: ${invalid.join(", ")}`;
    else if (recipients.length > MAX_RECIPIENTS)
      issues.emails = `Enter at most ${MAX_RECIPIENTS} email addresses.`;
    const allowExternalEmails = !isOrgAccess && form.allowExternalEmails;
    const accessType = isOrgAccess
      ? SecretSharingAccessType.Organization
      : SecretSharingAccessType.Anyone;
    if (allowExternalEmails && recipients.length && !form.password)
      issues.password = "External recipients need a password to open the secret.";
    setErrors(issues);
    if (Object.keys(issues).length) return;
    setPending(true);
    try {
      const { id } = await create.mutateAsync({
        name: isPublic ? undefined : form.name || undefined,
        password: form.password || undefined,
        secretValue: form.secret,
        expiresIn: form.expiresIn,
        maxViews: form.shouldLimitView ? Number(form.viewLimit) : undefined,
        accessType: isPublic ? undefined : accessType,
        authorizedEmails: recipients.length ? recipients : undefined,
        allowExternalEmails: isPublic ? undefined : allowExternalEmails
      });
      if (recipients.length) {
        const requiresAccount = !allowExternalEmails && !isOrgAccess;
        const plural = recipients.length > 1;
        setResult({ kind: "email", recipients: recipients.length, requiresAccount });
        toast({
          tone: "ok",
          title: requiresAccount
            ? `If the provided ${plural ? "emails are" : "email is"} associated with an Infisical account they will receive a link`
            : `Secret link sent to the provided ${plural ? "emails" : "email"}`
        });
      } else {
        const url = sharedSecretLink(id, subOrganization);
        setResult({
          kind: "link",
          url,
          expiresAt: formatExpiry(form.expiresIn),
          views: form.shouldLimitView ? form.viewLimit : "Unlimited"
        });
        await writeLink(url, {
          copied: "Secret link copied to clipboard",
          blocked: "Secret link created. Copy it below, your browser blocked clipboard access."
        });
      }
      setForm(blank);
    } catch (error) {
      toast({
        tone: "bad",
        title: "Could not create the secret link",
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setPending(false);
    }
  };

  const body: ReactNode = result ? (
    <LinkResult
      title={result.kind === "link" ? "Secret link created" : "Secret link sent"}
      description={
        result.kind === "link"
          ? "Save the link before you leave this page."
          : `Sent to ${result.recipients} recipient${result.recipients === 1 ? "" : "s"}. ${
              result.requiresAccount
                ? "Only those with an Infisical account will receive a link."
                : "Each one receives a unique link."
            }`
      }
      url={result.kind === "link" ? result.url : undefined}
      meta={
        result.kind === "link"
          ? [
              { icon: "calendar", label: `Expires ${result.expiresAt}` },
              {
                icon: "eye",
                label:
                  result.views === "Unlimited"
                    ? "Unlimited views"
                    : `${result.views} view${result.views === "1" ? "" : "s"}`
              }
            ]
          : []
      }
    />
  ) : (
    <form
      id={formId}
      noValidate
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {!isPublic && (
        <Field
          label="Name"
          optional
          description="Visible only to your organization, not the recipient."
          error={errors.name}
        >
          <Input
            value={form.name}
            placeholder="API Key"
            autoComplete="off"
            spellCheck={false}
            invalid={Boolean(errors.name)}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
      )}
      <Field label="Secret value" error={errors.secret}>
        <SecretInput
          multiline
          value={form.secret}
          placeholder="Enter sensitive data to share via an encrypted link"
          invalid={Boolean(errors.secret)}
          onChange={(secret) => patch({ secret })}
        />
      </Field>
      <Field
        label="Expires in"
        description={`The link stops working on ${formatExpiry(form.expiresIn)}.${
          isLifetimeCapped
            ? ` Your organization caps links at ${available[available.length - 1]?.label}.`
            : ""
        }`}
      >
        <Select
          value={form.expiresIn}
          options={EXPIRES_IN_OPTIONS.map((option) => ({
            ...option,
            disabled: !available.includes(option)
          }))}
          onChange={(expiresIn) => patch({ expiresIn })}
        />
      </Field>
      <Accordion type="single" collapsible>
        <AccordionItem value="options">
          <AccordionTrigger>
            <span className={styles.accordionTitle}>
              More options
              <SmallText muted>
                {constraints === 0
                  ? "No constraints"
                  : `${constraints} constraint${constraints === 1 ? "" : "s"}`}
              </SmallText>
            </span>
          </AccordionTrigger>
          <AccordionContent className={styles.accordionBody}>
            <div className={styles.form}>
              {!isViewLimitEnforced && (
                <span className={styles.toggle}>
                  <Switch
                    id={`${formId}-limit-views`}
                    checked={form.shouldLimitView}
                    onCheckedChange={(shouldLimitView) => patch({ shouldLimitView })}
                  />
                  <FieldLabel htmlFor={`${formId}-limit-views`}>
                    Limit how many times it can be viewed
                  </FieldLabel>
                </span>
              )}
              {form.shouldLimitView && (
                <Field
                  label="Maximum views"
                  error={errors.viewLimit}
                  description={
                    isViewLimitEnforced
                      ? `Your organization caps links at ${maxSharedSecretViewLimit} view${maxSharedSecretViewLimit === 1 ? "" : "s"}.`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min={1}
                    max={viewCeiling}
                    value={form.viewLimit}
                    invalid={Boolean(errors.viewLimit)}
                    onChange={(event) => patch({ viewLimit: event.target.value })}
                  />
                </Field>
              )}
              <Field label="Password" optional error={errors.password}>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  placeholder="Password"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  invalid={Boolean(errors.password)}
                  onChange={(event) => patch({ password: event.target.value })}
                  trailing={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      iconOnly
                      icon={showPassword ? "eye-off" : "eye"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Hide password" : "Show password"}
                    </Button>
                  }
                />
              </Field>
              {!isPublic && (
                <>
                  <div className={styles.groupLabel}>Delivery</div>
                  <span className={styles.toggle}>
                    <Switch
                      id={`${formId}-org-only`}
                      checked={isOrgAccess}
                      disabled={!allowSecretSharingOutsideOrganization}
                      onCheckedChange={(orgOnly) =>
                        patch(orgOnly ? { orgOnly, allowExternalEmails: false } : { orgOnly })
                      }
                    />
                    <FieldLabel htmlFor={`${formId}-org-only`}>
                      Limit access to people within organization
                    </FieldLabel>
                    {!allowSecretSharingOutsideOrganization && (
                      <Tooltip content="Enforced by your organization">
                        <span className={styles.hint}>
                          <Icon name="lock" size={14} label="Enforced by your organization" />
                        </span>
                      </Tooltip>
                    )}
                  </span>
                  <span className={styles.toggle}>
                    <Switch
                      id={`${formId}-allow-external`}
                      checked={!isOrgAccess && form.allowExternalEmails}
                      disabled={isOrgAccess}
                      onCheckedChange={(allowExternalEmails) => patch({ allowExternalEmails })}
                    />
                    <FieldLabel htmlFor={`${formId}-allow-external`}>
                      Allow recipients without an Infisical account
                    </FieldLabel>
                    {!allowSecretSharingOutsideOrganization && (
                      <Tooltip content="External sharing is disabled by your organization">
                        <span className={styles.hint}>
                          <Icon name="lock" size={14} label="External sharing is disabled" />
                        </span>
                      </Tooltip>
                    )}
                  </span>
                  <Field
                    label="Email recipients"
                    optional
                    error={errors.emails}
                    description={
                      !isOrgAccess && form.allowExternalEmails
                        ? "Recipients need the password above, not an Infisical account."
                        : "Recipients must sign in to Infisical to verify their identity."
                    }
                  >
                    <Input
                      value={form.emails}
                      placeholder="user1@example.com, user2@example.com"
                      invalid={Boolean(errors.emails)}
                      onChange={(event) => patch({ emails: event.target.value })}
                      trailing={
                        <Tooltip content="Each recipient gets their own link. Leave this empty to get one link you can share yourself.">
                          <span className={styles.hint}>
                            <Icon name="info" size={14} label="About email recipients" />
                          </span>
                        </Tooltip>
                      }
                    />
                  </Field>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </form>
  );

  const submitButton = result ? (
    <Button onClick={reset}>Share another secret</Button>
  ) : (
    <Button type="submit" form={formId} loading={pending}>
      Create secret link
    </Button>
  );

  return {
    body,
    submitButton,
    dirty: dirty && !result,
    pending,
    reset,
    hasResult: Boolean(result)
  };
};
