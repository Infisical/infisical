import { useState } from "react";
import { format } from "date-fns";
import { MailIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Calendar } from "@app/components/v4/ui/calendar";
import { Field, FieldError, FieldLabel } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Select } from "@app/components/v4/ui/select";
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
import { Textarea } from "@app/components/v4/ui/textarea";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import type { Secret, SecretReminder } from "../../secrets-model";
import { Gate } from "../flows/shared";
import { NEXT_PHASE } from "../overview-cells";

import flowStyles from "../flows/flows.module.css";
import styles from "./row-actions.module.css";

export function CommentForm({
  comment,
  canEdit,
  onSave,
  onClose
}: {
  comment: string;
  canEdit: boolean;
  onSave: (comment: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(comment);
  if (!canEdit)
    return (
      <Stack gap={12}>
        <div className={styles.formLabel}>Comment</div>
        <div className={styles.readComment}>{comment}</div>
        <Inline justify="end">
          <Button variant="ghost" size="xs" onClick={onClose}>
            Close
          </Button>
        </Inline>
      </Stack>
    );
  return (
    <form
      className={styles.popoverForm}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <FieldLabel htmlFor="secret-comment">Comment</FieldLabel>
      <Textarea
        id="secret-comment"
        autoFocus
        className={styles.fixedTextarea}
        value={draft}
        placeholder="Add a comment..."
        onChange={(event) => setDraft(event.target.value)}
      />
      <Inline gap={8} justify="end">
        <Button type="button" variant="ghost" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="xs" disabled={draft === comment}>
          Save comment
        </Button>
      </Inline>
    </form>
  );
}

export function TagForm({
  tags,
  options,
  canEdit,
  onSave,
  onClose
}: {
  tags: string[];
  options: string[];
  canEdit: boolean;
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(tags);
  const [created, setCreated] = useState<string[]>([]);
  const all = [...new Set([...options, ...created, ...draft])].sort();
  return (
    <form
      className={styles.popoverForm}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(draft);
      }}
    >
      <div className={styles.formLabel}>Tags</div>
      <MultiSelect
        label="Tags"
        options={all.map((tag) => ({ value: tag, label: tag }))}
        value={draft}
        placeholder="Select or create tags..."
        searchable
        disabled={!canEdit}
        onChange={setDraft}
        onCreate={(query) => {
          const parsed = slugSchema().safeParse(query.trim());
          if (!parsed.success) return;
          setCreated((current) => [...current, parsed.data]);
          setDraft((current) => [...current, parsed.data]);
        }}
      />
      {!canEdit && (
        <SmallText muted>You do not have permission to edit tags on this secret.</SmallText>
      )}
      <Inline gap={8} justify="end">
        <Button type="button" variant="ghost" size="xs" onClick={onClose}>
          Close
        </Button>
        {canEdit && (
          <Button type="submit" size="xs" disabled={JSON.stringify(draft) === JSON.stringify(tags)}>
            Save tags
          </Button>
        )}
      </Inline>
    </form>
  );
}

type MetadataEntry = { id: string; key: string; value: string; encrypted: boolean };

export function MetadataForm({
  metadata,
  canEdit,
  onSave,
  onClose
}: {
  metadata: Secret["metadata"];
  canEdit: boolean;
  onSave: (metadata: Secret["metadata"]) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<MetadataEntry[]>(() =>
    metadata.map((entry) => ({ ...entry, id: crypto.randomUUID() }))
  );
  const [errors, setErrors] = useState<string[]>([]);
  const strip = (list: MetadataEntry[]) =>
    list.map(({ key, value, encrypted }) => ({ key, value, encrypted }));
  const dirty = JSON.stringify(strip(entries)) !== JSON.stringify(metadata);
  const update = (id: string, value: Partial<MetadataEntry>) => {
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...value } : entry))
    );
    setErrors((current) => current.filter((entry) => entry !== id));
  };
  return (
    <form
      className={styles.popoverForm}
      onSubmit={(event) => {
        event.preventDefault();
        const missing = entries.filter((entry) => !entry.key).map((entry) => entry.id);
        setErrors(missing);
        if (missing.length) return;
        onSave(strip(entries));
      }}
    >
      <div>
        <div className={styles.formLabel}>Metadata</div>
        <SmallText muted>Encrypted Metadata will not be searchable via the UI or API.</SmallText>
      </div>
      <div className={styles.metadataList} data-scroll-fade="y">
        {entries.length === 0 && (
          <SmallText muted className={styles.center}>
            No metadata entries. Click below to add.
          </SmallText>
        )}
        {entries.map((entry, index) => (
          <div key={entry.id} className={styles.metadataRow}>
            <div className={styles.grow}>
              {index === 0 && <span className={styles.columnLabel}>Key</span>}
              <Input
                aria-label={`Metadata key ${index + 1}`}
                value={entry.key}
                placeholder="Enter key"
                disabled={!canEdit}
                invalid={errors.includes(entry.id)}
                onChange={(event) => update(entry.id, { key: event.target.value })}
              />
              {errors.includes(entry.id) && <FieldError>Key is required</FieldError>}
            </div>
            <div className={styles.grow}>
              {index === 0 && <span className={styles.columnLabel}>Value</span>}
              <Input
                aria-label={`Metadata value ${index + 1}`}
                value={entry.value}
                placeholder="Enter value"
                disabled={!canEdit}
                onChange={(event) => update(entry.id, { value: event.target.value })}
              />
            </div>
            <div className={styles.encryptCell}>
              {index === 0 && <span className={styles.columnLabel}>Encrypt</span>}
              <span className={styles.controlBox}>
                <Switch
                  aria-label={`Encrypt metadata entry ${index + 1}`}
                  checked={entry.encrypted}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => update(entry.id, { encrypted: checked })}
                />
              </span>
            </div>
            <div className={styles.removeCell}>
              {index === 0 && <span className={styles.columnLabel} aria-hidden />}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                icon="trash"
                iconOnly
                disabled={!canEdit}
                onClick={() =>
                  setEntries((current) => current.filter((item) => item.id !== entry.id))
                }
              >
                {`Remove metadata entry ${index + 1}`}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {canEdit ? (
        <span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            icon="plus"
            onClick={() =>
              setEntries((current) => [
                ...current,
                { id: crypto.randomUUID(), key: "", value: "", encrypted: false }
              ])
            }
          >
            Add entry
          </Button>
        </span>
      ) : (
        <SmallText muted>You do not have permission to edit metadata on this secret.</SmallText>
      )}
      <Inline gap={8} justify="end">
        <Button type="button" variant="ghost" size="xs" onClick={onClose}>
          Close
        </Button>
        {canEdit && (
          <Button type="submit" size="xs" disabled={!dirty}>
            Save metadata
          </Button>
        )}
      </Inline>
    </form>
  );
}

const MIN_REPEAT_DAYS = 1;
const MAX_REPEAT_DAYS = 365;
const DEFAULT_REPEAT_DAYS = 30;
const RECURRING = "Recurring";
const ONE_TIME = "One Time";
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

function DateButton({
  id,
  value,
  disabled,
  invalid,
  align,
  onChange
}: {
  id: string;
  value?: Date;
  disabled: boolean;
  invalid: boolean;
  align: "start" | "end";
  onChange: (value?: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          icon="calendar"
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={styles.dateButton}
        >
          {value ? format(value, "P") : <span className={styles.placeholder}>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align}>
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value ?? tomorrow()}
          disabled={{ before: tomorrow() }}
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function ReminderSheet({
  open,
  secretName,
  environmentLabel,
  reminder,
  canEdit,
  onOpenChange,
  onSave
}: {
  open: boolean;
  secretName: string;
  environmentLabel: string;
  reminder?: SecretReminder;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (reminder: SecretReminder | undefined) => void;
}) {
  const initial = {
    type: reminder?.repeatDays ? RECURRING : ONE_TIME,
    repeatDays: reminder?.repeatDays ?? null,
    fromDate: reminder?.fromDate ? new Date(reminder.fromDate) : undefined,
    nextReminderDate: reminder?.nextReminderDate ? new Date(reminder.nextReminderDate) : undefined,
    message: reminder?.message ?? ""
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const patch = (value: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...value }));
    setErrors({});
  };
  const submit = () => {
    const issues: Record<string, string> = {};
    if (form.type === ONE_TIME) {
      if (!form.nextReminderDate) issues.nextReminderDate = "Reminder date is required";
      else if (form.nextReminderDate <= new Date())
        issues.nextReminderDate = "Reminder date must be in the future";
    } else {
      if (form.repeatDays !== null && form.repeatDays < MIN_REPEAT_DAYS)
        issues.repeatDays = `Must be at least ${MIN_REPEAT_DAYS} day`;
      if (form.repeatDays !== null && form.repeatDays > MAX_REPEAT_DAYS)
        issues.repeatDays = `Must be less than ${MAX_REPEAT_DAYS} days`;
      if (!form.fromDate) issues.fromDate = "Start date is required";
      else if (form.fromDate <= new Date()) issues.fromDate = "Start date must be in the future";
    }
    setErrors(issues);
    if (Object.keys(issues).length) return;
    onSave({
      ...(form.type === RECURRING
        ? {
            repeatDays: form.repeatDays ?? undefined,
            fromDate: form.fromDate?.toISOString()
          }
        : { nextReminderDate: form.nextReminderDate?.toISOString() }),
      message: form.message,
      recipients: reminder?.recipients ?? ["All project members"]
    });
  };
  const every = form.repeatDays && form.repeatDays > 1 ? `${form.repeatDays} days` : "day";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={flowStyles.secretSheet}>
        <SheetHeader>
          <SheetTitle>{reminder ? "Edit reminder" : "Add reminder"}</SheetTitle>
          <SheetDescription>
            {`Notify the channels below when ${secretName} in ${environmentLabel} is due for rotation.`}
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <form
            id="secret-reminder-form"
            className={styles.sheetForm}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field label="Recurrence">
              <Select
                value={form.type}
                disabled={!canEdit}
                options={[
                  { value: RECURRING, label: RECURRING },
                  { value: ONE_TIME, label: ONE_TIME }
                ]}
                onChange={(type) =>
                  patch(
                    type === RECURRING
                      ? {
                          type,
                          repeatDays: DEFAULT_REPEAT_DAYS,
                          nextReminderDate: undefined,
                          fromDate: undefined
                        }
                      : { type, nextReminderDate: tomorrow(), repeatDays: null }
                  )
                }
              />
            </Field>
            {form.type === RECURRING ? (
              <div className={styles.pair}>
                <Field
                  label="Interval (days)"
                  error={errors.repeatDays}
                  description={
                    form.repeatDays
                      ? `Every ${every}${form.fromDate ? ` from ${format(form.fromDate, "MM/dd/yy")}` : ""}`
                      : undefined
                  }
                  className={styles.grow}
                >
                  <Input
                    type="number"
                    min={MIN_REPEAT_DAYS}
                    max={MAX_REPEAT_DAYS}
                    placeholder={String(DEFAULT_REPEAT_DAYS)}
                    disabled={!canEdit}
                    value={form.repeatDays ?? ""}
                    onChange={(event) => {
                      const value = parseInt(event.target.value, 10);
                      patch({ repeatDays: Number.isNaN(value) ? null : value });
                    }}
                  />
                </Field>
                <Field label="Start date" error={errors.fromDate} className={styles.grow}>
                  <DateButton
                    id="reminder-start-date"
                    align="end"
                    value={form.fromDate}
                    disabled={!canEdit}
                    invalid={Boolean(errors.fromDate)}
                    onChange={(fromDate) => patch({ fromDate })}
                  />
                </Field>
              </div>
            ) : (
              <Field label="Reminder date" error={errors.nextReminderDate}>
                <DateButton
                  id="reminder-date"
                  align="start"
                  value={form.nextReminderDate}
                  disabled={!canEdit}
                  invalid={Boolean(errors.nextReminderDate)}
                  onChange={(nextReminderDate) => patch({ nextReminderDate })}
                />
              </Field>
            )}
            <Field label="Note">
              <Textarea
                value={form.message}
                placeholder="Remember to rotate this secret every month."
                disabled={!canEdit}
                onChange={(event) => patch({ message: event.target.value })}
              />
            </Field>
            <div className={styles.channels}>
              <div className={styles.channelsHead}>
                <div>
                  <div className={styles.formLabel}>Channels</div>
                  <SmallText muted>Add at least one delivery channel.</SmallText>
                </div>
                <Gate reason={NEXT_PHASE}>
                  <Button type="button" variant="outline" size="xs" icon="plus" disabled>
                    Add channel
                  </Button>
                </Gate>
              </div>
              <div className={styles.channelCard}>
                <span className={styles.channelTitle}>
                  <Icon icon={MailIcon} />
                  Email
                </span>
                <SmallText muted>
                  {`Recipients: ${(reminder?.recipients ?? ["All project members"]).join(", ")}`}
                </SmallText>
              </div>
            </div>
            {!canEdit && (
              <SmallText muted>
                You do not have permission to manage reminders on this secret.
              </SmallText>
            )}
          </form>
        </SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="between">
            <span>
              {reminder && canEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  icon="trash"
                  onClick={() => onSave(undefined)}
                >
                  Delete
                </Button>
              )}
            </span>
            <Inline gap={8}>
              <Button type="button" variant="ghost" size="xs" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {canEdit && (
                <Button type="submit" form="secret-reminder-form" size="xs" disabled={!dirty}>
                  {reminder ? "Update reminder" : "Create reminder"}
                </Button>
              )}
            </Inline>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
