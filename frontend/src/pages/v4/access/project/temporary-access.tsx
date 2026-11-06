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
import { ProjectUserMembershipTemporaryMode } from "@app/hooks/api/projects/types";

import { grantSlug, isGrantExpired, type RoleGrant } from "../roles";

import styles from "./project.module.css";

export const RANGE_ERROR = "Only valid time values are accepted (1h, 20m, 2d).";

export const isValidRange = (value?: string) => {
  if (!value?.trim()) return false;
  const parsed = ms(value);
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0;
};

export type GrantDraft = {
  role: string;
  isTemporary: boolean;
  temporaryRange?: string;
  temporaryAccessStartTime?: string;
  temporaryAccessEndTime?: string;
};

export const permanent = (role: string): GrantDraft => ({ role, isTemporary: false });

export const withRange = (role: string, range: string): GrantDraft => {
  const start = Date.now();
  return {
    role,
    isTemporary: true,
    temporaryRange: range,
    temporaryAccessStartTime: new Date(start).toISOString(),
    temporaryAccessEndTime: new Date(start + ms(range)).toISOString()
  };
};

export const draftOf = (grant: RoleGrant): GrantDraft => ({
  role: grantSlug(grant),
  isTemporary: grant.isTemporary,
  temporaryRange: grant.temporaryRange ?? undefined,
  temporaryAccessStartTime: grant.temporaryAccessStartTime ?? undefined,
  temporaryAccessEndTime: grant.temporaryAccessEndTime ?? undefined
});

export const toRolesDto = (drafts: readonly GrantDraft[]) =>
  drafts.map((draft) =>
    draft.isTemporary && draft.temporaryRange
      ? {
          role: draft.role,
          isTemporary: true as const,
          temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
          temporaryRange: draft.temporaryRange,
          temporaryAccessStartTime: draft.temporaryAccessStartTime ?? new Date().toISOString()
        }
      : { role: draft.role, isTemporary: false as const }
  );

export const durationOf = (grant: GrantDraft) => {
  if (!grant.isTemporary)
    return { text: "Permanent", tooltip: "Non-expiring access", expired: false };
  if (isGrantExpired(grant))
    return { text: "Access expired", tooltip: "Timed access expired", expired: true };
  const end = new Date(grant.temporaryAccessEndTime ?? "");
  return {
    text: formatDistance(end, Date.now()),
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
      {isGrantExpired(grant) && (
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
  disabledReason,
  label,
  defaultOpen = false,
  onChange
}: {
  grant: GrantDraft;
  disabledReason?: string;
  label: string;
  defaultOpen?: boolean;
  onChange: (next: GrantDraft) => void;
}) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!defaultOpen) return undefined;
    const timer = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(timer);
  }, [defaultOpen]);
  const { text, tooltip, expired } = durationOf(grant);
  const trigger = (
    <PopoverTrigger asChild>
      <Button variant="outline" disabledReason={disabledReason} aria-label={`${label}: ${text}`}>
        {grant.isTemporary && (expired ? <Icon icon={ClockAlertIcon} /> : <Icon name="clock" />)}
        <span className={styles.grow}>{text}</span>
        <Icon name="chev-down" />
      </Button>
    </PopoverTrigger>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {disabledReason ? trigger : <Tooltip content={tooltip}>{trigger}</Tooltip>}
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
