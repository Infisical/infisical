import { useEffect, useId, useState } from "react";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon } from "lucide-react";
import ms from "ms";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { DEMO_NOW, isExpired, type ProjectRoleGrant } from "../model";

import styles from "./project.module.css";

export const RANGE_ERROR = "Only valid time values are accepted (1h, 20m, 2d).";

export const isValidRange = (value?: string) => {
  if (!value?.trim()) return false;
  const parsed = ms(value);
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0;
};

export type GrantDraft = Omit<ProjectRoleGrant, "id">;

export const permanent = (role: string): GrantDraft => ({ role, isTemporary: false });

export const withRange = (role: string, range: string): GrantDraft => ({
  role,
  isTemporary: true,
  temporaryRange: range,
  temporaryAccessStartTime: new Date(DEMO_NOW).toISOString(),
  temporaryAccessEndTime: new Date(DEMO_NOW + ms(range)).toISOString()
});

export const durationOf = (grant: GrantDraft) => {
  if (!grant.isTemporary)
    return { text: "Permanent", tooltip: "Non-expiring access", expired: false };
  if (isExpired({ id: "", ...grant }))
    return { text: "Access expired", tooltip: "Timed access expired", expired: true };
  const end = new Date(grant.temporaryAccessEndTime ?? "");
  return {
    text: formatDistance(end, DEMO_NOW),
    tooltip: `Until ${format(end, "yyyy-MM-dd hh:mm:ss aaa")}`,
    expired: false
  };
};

export const DurationBadge = ({ grant }: { grant: GrantDraft }) => {
  const { text, tooltip, expired } = durationOf(grant);
  if (!grant.isTemporary) return <span>{text}</span>;
  return (
    <Tooltip content={tooltip}>
      <Badge tone={expired ? "bad" : "warn"}>
        {expired ? <Icon icon={ClockAlertIcon} size={12} /> : <Icon name="clock" size={12} />}
        {text}
      </Badge>
    </Tooltip>
  );
};

export const TimedAccessPanel = ({
  grant,
  title = "Configure timed access",
  applyLabel,
  removeLabel = "Remove duration",
  onApply,
  onRemove
}: {
  grant: GrantDraft;
  title?: string;
  applyLabel?: string;
  removeLabel?: string;
  onApply: (range: string) => void;
  onRemove: () => void;
}) => {
  const id = useId();
  const [draft, setDraft] = useState(grant.isTemporary ? (grant.temporaryRange ?? "1h") : "1h");
  const valid = isValidRange(draft);
  return (
    <Stack gap={12}>
      <div className={styles.panelTitle}>{title}</div>
      {grant.isTemporary && isExpired({ id: "", ...grant }) && (
        <span>
          <Badge tone="bad">Expired</Badge>
        </span>
      )}
      <Field
        label="Validity"
        description="Use a duration such as 30m, 1h, or 3d."
        error={draft && !valid ? RANGE_ERROR : undefined}
      >
        <Input
          id={`${id}-validity`}
          value={draft}
          invalid={Boolean(draft) && !valid}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>
      <div className={styles.inline}>
        <Button size="xs" variant="outline" disabled={!valid} onClick={() => onApply(draft)}>
          {applyLabel ?? (grant.isTemporary ? "Restart" : "Configure")}
        </Button>
        {grant.isTemporary && (
          <Button size="xs" variant="danger-ghost" onClick={onRemove}>
            {removeLabel}
          </Button>
        )}
      </div>
    </Stack>
  );
};

export const DurationPicker = ({
  grant,
  disabled,
  label,
  defaultOpen = false,
  onChange
}: {
  grant: GrantDraft;
  disabled?: boolean;
  label: string;
  defaultOpen?: boolean;
  onChange: (next: GrantDraft) => void;
}) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!defaultOpen) return undefined;
    // Opening with the parent sheet loses to its focus trap, so open once the sheet has settled.
    const timer = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(timer);
  }, [defaultOpen]);
  const { text, tooltip, expired } = durationOf(grant);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={tooltip}>
        <PopoverTrigger asChild>
          <Button variant="outline" disabled={disabled} aria-label={`${label}: ${text}`}>
            {grant.isTemporary &&
              (expired ? <Icon icon={ClockAlertIcon} /> : <Icon name="clock" />)}
            <span className={styles.grow}>{text}</span>
            <Icon name="chev-down" />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="right" align="start" className={styles.panel}>
        <TimedAccessPanel
          key={String(open)}
          grant={grant}
          onApply={(range) => {
            onChange(withRange(grant.role, range));
            setOpen(false);
          }}
          onRemove={() => {
            onChange(permanent(grant.role));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
