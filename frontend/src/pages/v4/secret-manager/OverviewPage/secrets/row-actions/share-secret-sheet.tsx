import { useState } from "react";
import { format } from "date-fns";
import ms from "ms";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@app/components/v4/ui/accordion";
import { Button } from "@app/components/v4/ui/button";
import { Field, FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { SecretValue } from "@app/components/v4/ui/sensitive-editor";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { EMAIL_LIST_DELIMITER, isValidEmail } from "@app/helpers/email";
import { SecretSharingAccessType } from "@app/hooks/api/secretSharing/types";

import { errorMessage } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { DiscardDialog } from "../flows/shared";

import flowStyles from "../flows/flows.module.css";
import styles from "./row-actions.module.css";

const expiresInOptions = [
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
const formatExpiry = (expiresIn: string) =>
  format(new Date(Date.now() + ms(expiresIn)), "MMM d, yyyy 'at' h:mm a");
const blank = {
  name: "",
  expiresIn: "1h",
  shouldLimitView: false,
  viewLimit: "1",
  password: "",
  orgOnly: true,
  allowExternalEmails: false,
  emails: ""
};
type Result = { expiresAt: string; views: string; recipients: number; url?: string };

export function ShareSecretSheet({
  open,
  value,
  onOpenChange
}: {
  open: boolean;
  value: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<Result>();
  const [discard, setDiscard] = useState(false);
  const [failure, setFailure] = useState("");
  const createSharedSecret = useV4Adapter("secrets").useCreateSharedSecret();
  const dirty = JSON.stringify(form) !== JSON.stringify(blank);
  const patch = (next: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...next }));
    setErrors({});
  };
  const close = () => {
    setForm(blank);
    setResult(undefined);
    onOpenChange(false);
  };
  const requestClose = () => {
    if (dirty && !result) setDiscard(true);
    else close();
  };
  const recipients = form.emails.split(EMAIL_LIST_DELIMITER).filter(Boolean);
  const constraints = [
    form.shouldLimitView,
    Boolean(form.password),
    form.orgOnly,
    !form.allowExternalEmails && recipients.length > 0
  ].filter(Boolean).length;
  const submit = async () => {
    const issues: Record<string, string> = {};
    if (form.name.length > 50) issues.name = "Name must be 50 characters or fewer.";
    if (!value) issues.secret = "Enter the value you want to share.";
    if (form.shouldLimitView) {
      const views = Number(form.viewLimit);
      if (!Number.isInteger(views) || views < 1)
        issues.viewLimit = "Enter a whole number of views, 1 or greater.";
      else if (views > ABSOLUTE_VIEW_CEILING)
        issues.viewLimit = `Enter at most ${ABSOLUTE_VIEW_CEILING} views.`;
    }
    const invalid = recipients.filter((email) => !isValidEmail(email));
    if (invalid.length) issues.emails = `Enter valid email addresses: ${invalid.join(", ")}`;
    else if (recipients.length > MAX_RECIPIENTS)
      issues.emails = `Enter at most ${MAX_RECIPIENTS} email addresses.`;
    if (form.allowExternalEmails && recipients.length && !form.password)
      issues.password = "External recipients need a password to open the secret.";
    setErrors(issues);
    if (Object.keys(issues).length) return;
    setFailure("");
    try {
      const { id } = await createSharedSecret.mutateAsync({
        name: form.name || undefined,
        password: form.password || undefined,
        secretValue: value,
        expiresIn: form.expiresIn,
        maxViews: form.shouldLimitView ? Number(form.viewLimit) : undefined,
        accessType: form.orgOnly
          ? SecretSharingAccessType.Organization
          : SecretSharingAccessType.Anyone,
        authorizedEmails: recipients.length ? recipients : undefined,
        allowExternalEmails: form.allowExternalEmails
      });
      setResult({
        expiresAt: formatExpiry(form.expiresIn),
        views: form.shouldLimitView ? form.viewLimit : "Unlimited",
        recipients: recipients.length,
        url: recipients.length ? undefined : `${window.location.origin}/shared/secret/${id}`
      });
      setForm(blank);
    } catch (error) {
      setFailure(errorMessage(error) ?? "Could not create the secret link.");
    }
  };
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <SheetContent className={flowStyles.secretSheet}>
          <SheetHeader>
            <SheetTitle>Share a secret</SheetTitle>
            <SheetDescription>
              Send this value through an encrypted, expiring link.
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            {result ? (
              <div className={styles.shareResult}>
                <span className={styles.resultMark}>
                  <Icon name="info" size={20} />
                </span>
                <div className={styles.resultTitle}>
                  {result.url ? "Secret link created" : "Secret link sent"}
                </div>
                <SmallText muted className={styles.center}>
                  {result.url
                    ? "Anyone with this link can view the secret within its limits."
                    : `Each of the ${result.recipients} recipient${result.recipients === 1 ? "" : "s"} gets their own link by email.`}
                </SmallText>
                {result.url && (
                  <Input
                    readOnly
                    mono
                    aria-label="Secret link"
                    value={result.url}
                    trailing={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        iconOnly
                        icon="copy"
                        onClick={() => navigator.clipboard.writeText(result.url ?? "")}
                      >
                        Copy link
                      </Button>
                    }
                  />
                )}
                <div className={styles.resultSummary}>
                  <span>
                    <Icon name="calendar" size={12} />
                    {`Expires ${result.expiresAt}`}
                  </span>
                  <span>
                    {result.views === "Unlimited"
                      ? "Unlimited views"
                      : `${result.views} view${result.views === "1" ? "" : "s"}`}
                  </span>
                </div>
              </div>
            ) : (
              <form
                id="share-secret-form"
                className={styles.sheetForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
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
                <Field
                  label="Secret value"
                  description="Uses the saved value. It cannot be edited here."
                  error={errors.secret}
                >
                  <SecretValue value={value} label="Secret value" copyable={false} />
                </Field>
                {failure && <SmallText className={styles.center}>{failure}</SmallText>}
                <div className={styles.formLabel}>Expiration</div>
                <Field
                  label="Expires in"
                  description={`The link stops working on ${formatExpiry(form.expiresIn)}.`}
                >
                  <Select
                    value={form.expiresIn}
                    options={expiresInOptions}
                    onChange={(expiresIn) => patch({ expiresIn })}
                  />
                </Field>
                <Accordion type="single" collapsible>
                  <AccordionItem value="options">
                    <AccordionTrigger>
                      <span className={styles.accordionTitle}>
                        More options
                        <span className={styles.constraintCount}>
                          {constraints === 0
                            ? "No constraints"
                            : `${constraints} constraint${constraints === 1 ? "" : "s"}`}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className={styles.sheetForm}>
                        <span className={styles.toggleLabel}>
                          <Switch
                            id="share-limit-views"
                            checked={form.shouldLimitView}
                            onCheckedChange={(shouldLimitView) => patch({ shouldLimitView })}
                          />
                          <FieldLabel htmlFor="share-limit-views">
                            Limit how many times it can be viewed
                          </FieldLabel>
                        </span>
                        {form.shouldLimitView && (
                          <Field label="Maximum views" error={errors.viewLimit}>
                            <Input
                              type="number"
                              min={1}
                              max={ABSOLUTE_VIEW_CEILING}
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
                            invalid={Boolean(errors.password)}
                            onChange={(event) => patch({ password: event.target.value })}
                            trailing={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                iconOnly
                                icon="eye"
                                aria-pressed={showPassword}
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? "Hide password" : "Show password"}
                              </Button>
                            }
                          />
                        </Field>
                        <div className={styles.formLabel}>Delivery</div>
                        <span className={styles.toggleLabel}>
                          <Switch
                            id="share-org-only"
                            checked={form.orgOnly}
                            onCheckedChange={(orgOnly) =>
                              patch(orgOnly ? { orgOnly, allowExternalEmails: false } : { orgOnly })
                            }
                          />
                          <FieldLabel htmlFor="share-org-only">
                            Limit access to people within organization
                          </FieldLabel>
                        </span>
                        <span className={styles.toggleLabel}>
                          <Switch
                            id="share-allow-external"
                            checked={!form.orgOnly && form.allowExternalEmails}
                            disabled={form.orgOnly}
                            onCheckedChange={(allowExternalEmails) =>
                              patch({ allowExternalEmails })
                            }
                          />
                          <FieldLabel htmlFor="share-allow-external">
                            Allow recipients without an Infisical account
                          </FieldLabel>
                        </span>
                        <Field
                          label="Email recipients"
                          optional
                          error={errors.emails}
                          description={
                            form.allowExternalEmails
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
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </form>
            )}
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              {result ? (
                <Button onClick={() => setResult(undefined)}>Share another secret</Button>
              ) : (
                <>
                  <Button type="button" variant="ghost" onClick={requestClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="share-secret-form"
                    loading={createSharedSecret.isPending}
                  >
                    Create secret link
                  </Button>
                </>
              )}
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardDialog
        open={discard}
        title="Discard secret?"
        description="Your unsaved changes will be lost."
        onKeep={() => setDiscard(false)}
        onDiscard={() => {
          setDiscard(false);
          close();
        }}
      />
    </>
  );
}
