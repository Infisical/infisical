import * as React from "react";

import { FrameScope } from "../lib/frame-context";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";

import styles from "./settings-card.module.css";

export type SettingsCardProps = Omit<
  React.ComponentPropsWithoutRef<"section">,
  "title" | "onSubmit"
> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  dirty?: boolean;
  onSave?: () => void | Promise<unknown>;
  onDiscard?: () => void;
  hint?: React.ReactNode;
  locked?: React.ReactNode;
  loading?: boolean;
  saveLabel?: string;
  /** Blocks Save and says why, the way Button's disabledReason does: the button stays focusable and shows the reason on hover and focus. */
  saveDisabledReason?: string;
  tone?: "default" | "danger";
  actions?: React.ReactNode;
  /** Renders the body edge to edge without the form and footer, for content that is not saved here, such as an embedded DataTable. */
  flush?: boolean;
};

export function SettingsCard({
  title,
  description,
  action,
  dirty = false,
  onSave,
  onDiscard,
  hint,
  locked,
  loading = false,
  saveLabel = "Save",
  saveDisabledReason,
  tone = "default",
  actions,
  flush = false,
  children,
  className,
  ref,
  ...props
}: SettingsCardProps & { ref?: React.Ref<HTMLElement> }) {
  const [saving, setSaving] = React.useState(false);
  const titleId = React.useId();
  const save = async () => {
    if (!onSave || !dirty || saving || locked || saveDisabledReason) return;
    setSaving(true);
    try {
      await onSave();
    } catch {
      // The caller reports the failure with a toast; the card only keeps what was typed.
    } finally {
      setSaving(false);
    }
  };
  let status: React.ReactNode = hint;
  if (locked)
    status = (
      <>
        <Icon name="lock" size={14} />
        {locked}
      </>
    );
  else if (saving)
    status = (
      <>
        <Spinner />
        Saving
      </>
    );
  else if (dirty)
    status = (
      <>
        <span className={styles.dirtyMark} aria-hidden="true" />
        Unsaved changes
      </>
    );
  const header = (
    <div className={styles.header}>
      <div className={styles.copy}>
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
  const body = loading ? <Skeleton lines={2} height={32} /> : children;
  const hasBody = loading || React.Children.toArray(children).length > 0;
  if (flush)
    return (
      <section
        ref={ref}
        data-slot="settings-card"
        data-tone={tone}
        data-flush=""
        aria-labelledby={titleId}
        className={cn(styles.card, className)}
        {...props}
      >
        {header}
        {hasBody && (
          <FrameScope framed>
            <div className={styles.flushContent}>{body}</div>
          </FrameScope>
        )}
      </section>
    );
  return (
    <section
      ref={ref}
      data-slot="settings-card"
      data-tone={tone}
      aria-labelledby={titleId}
      className={cn(styles.card, className)}
      {...props}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {header}
        {hasBody && (
          <FrameScope framed>
            <fieldset className={styles.content} disabled={Boolean(locked) || saving}>
              {body}
            </fieldset>
          </FrameScope>
        )}
        <div className={styles.footer}>
          <p className={styles.status} role="status">
            {status}
          </p>
          {!locked && (
            <div className={styles.buttons}>
              {tone === "danger" ? (
                actions
              ) : (
                <>
                  {dirty && onDiscard && !saving && (
                    <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
                      Discard
                    </Button>
                  )}
                  {onSave && (
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={!saveDisabledReason && (!dirty || loading)}
                      disabledReason={saveDisabledReason}
                      loading={saving}
                    >
                      {saveLabel}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
SettingsCard.displayName = "SettingsCard";
