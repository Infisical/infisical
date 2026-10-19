import * as React from "react";
import { cn } from "cn";

import { Button } from "./button";
import { Icon } from "./icon";
import { Skeleton } from "./skeleton";
import { Spinner } from "./spinner";

import styles from "./settings-card.module.css";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; message: string };

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
  tone?: "default" | "danger";
  actions?: React.ReactNode;
};

export const SettingsCard = React.forwardRef<HTMLElement, SettingsCardProps>(
  (
    {
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
      tone = "default",
      actions,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const [state, setState] = React.useState<SaveState>({ kind: "idle" });
    const titleId = React.useId();
    React.useEffect(() => {
      if (state.kind !== "saved") return undefined;
      const timer = window.setTimeout(() => setState({ kind: "idle" }), 3000);
      return () => window.clearTimeout(timer);
    }, [state.kind]);
    React.useEffect(() => {
      if (dirty && state.kind === "saved") setState({ kind: "idle" });
    }, [dirty, state.kind]);
    const saving = state.kind === "saving";
    const save = async () => {
      if (!onSave || !dirty || saving || locked) return;
      setState({ kind: "saving" });
      try {
        await onSave();
        setState({ kind: "saved" });
      } catch (error) {
        setState({
          kind: "failed",
          message: error instanceof Error ? error.message : "The change was not saved. Try again."
        });
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
    else if (state.kind === "failed")
      status = <span className={styles.failed}>{state.message}</span>;
    else if (state.kind === "saved")
      status = (
        <>
          <Icon name="check-c" size={14} className={styles.saved} />
          Saved
        </>
      );
    else if (dirty)
      status = (
        <>
          <span className={styles.dirtyMark} aria-hidden="true" />
          Unsaved changes
        </>
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
          <div className={styles.header}>
            <div className={styles.copy}>
              <h3 id={titleId} className={styles.title}>
                {title}
              </h3>
              {description && <p className={styles.description}>{description}</p>}
            </div>
            {action && <div className={styles.action}>{action}</div>}
          </div>
          <fieldset className={styles.content} disabled={Boolean(locked) || saving}>
            {loading ? <Skeleton lines={2} height={32} /> : children}
          </fieldset>
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onDiscard();
                          setState({ kind: "idle" });
                        }}
                      >
                        Discard
                      </Button>
                    )}
                    {onSave && (
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!dirty || loading}
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
);
SettingsCard.displayName = "SettingsCard";
