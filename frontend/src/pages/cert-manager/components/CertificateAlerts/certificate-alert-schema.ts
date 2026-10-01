import { z } from "zod";

import {
  CertificateAlertEventType,
  channelFormSchema,
  MAX_CERTIFICATE_ALERT_BEFORE_DAYS,
  MAX_CERTIFICATE_ALERT_FILTER_IDS
} from "@app/hooks/api/alerts";

import { CertificateAlertStep, MAX_CHANNELS, TCertificateFilterKind } from "./types";

const ALERT_BEFORE_PATTERN = /^(\d{1,4})([dwmy])$/;
const DAYS_PER_UNIT: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 };

const alertBeforeToDays = (alertBefore: string): number | null => {
  const match = alertBefore.trim().match(ALERT_BEFORE_PATTERN);
  return match ? parseInt(match[1], 10) * DAYS_PER_UNIT[match[2]] : null;
};

const ALERT_BEFORE_UNIT_LABELS: Record<string, string> = {
  d: "day",
  w: "week",
  m: "month",
  y: "year"
};

export const formatAlertBefore = (alertBefore?: string | null, fallback = "-"): string => {
  if (!alertBefore) return fallback;
  const match = alertBefore.trim().match(ALERT_BEFORE_PATTERN);
  if (!match) return alertBefore;
  const value = parseInt(match[1], 10);
  return `${value} ${ALERT_BEFORE_UNIT_LABELS[match[2]]}${value === 1 ? "" : "s"}`;
};

export const isUnfinishedFilter = (ids?: string[]) => ids?.length === 0;

const UNFINISHED_FILTER_MESSAGES: Record<TCertificateFilterKind, string> = {
  applicationIds: "Select at least one application, or remove this filter",
  profileIds: "Select at least one profile, or remove this filter"
};

export const certificateAlertFormSchema = z
  .object({
    eventType: z.nativeEnum(CertificateAlertEventType),
    name: z.string().trim().min(1, "Name is required").max(255),
    description: z.string().trim().max(1000),
    alertBefore: z.string().trim(),
    dailyReminder: z.boolean(),
    enabled: z.boolean(),
    applicationIds: z
      .array(z.string())
      .max(
        MAX_CERTIFICATE_ALERT_FILTER_IDS,
        `Select up to ${MAX_CERTIFICATE_ALERT_FILTER_IDS} applications`
      )
      .optional(),
    profileIds: z
      .array(z.string())
      .max(
        MAX_CERTIFICATE_ALERT_FILTER_IDS,
        `Select up to ${MAX_CERTIFICATE_ALERT_FILTER_IDS} profiles`
      )
      .optional(),
    conditionNames: z.record(z.string()),
    channels: z.array(channelFormSchema).min(1, "Add at least one channel").max(MAX_CHANNELS)
  })
  .superRefine((form, ctx) => {
    (Object.keys(UNFINISHED_FILTER_MESSAGES) as TCertificateFilterKind[]).forEach((kind) => {
      if (isUnfinishedFilter(form[kind])) {
        ctx.addIssue({ code: "custom", path: [kind], message: UNFINISHED_FILTER_MESSAGES[kind] });
      }
    });
    if (form.eventType !== CertificateAlertEventType.Expiry) return;
    const days = alertBeforeToDays(form.alertBefore);
    if (days === null) {
      ctx.addIssue({
        code: "custom",
        path: ["alertBefore"],
        message: "Use a number and a unit, for example 30d"
      });
    } else if (days < 1 || days > MAX_CERTIFICATE_ALERT_BEFORE_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["alertBefore"],
        message: `Must be between 1 and ${MAX_CERTIFICATE_ALERT_BEFORE_DAYS} days`
      });
    }
  });

export type TCertificateAlertForm = z.infer<typeof certificateAlertFormSchema>;

export const STEP_FIELDS: Partial<Record<CertificateAlertStep, (keyof TCertificateAlertForm)[]>> = {
  [CertificateAlertStep.Details]: [
    "eventType",
    "name",
    "description",
    "alertBefore",
    "dailyReminder"
  ],
  [CertificateAlertStep.Filters]: ["applicationIds", "profileIds"],
  [CertificateAlertStep.Channels]: ["channels"]
};

export const hasUnfinishedFilter = (form: Pick<TCertificateAlertForm, TCertificateFilterKind>) =>
  isUnfinishedFilter(form.applicationIds) || isUnfinishedFilter(form.profileIds);

export const emptyCertificateAlertForm = (
  eventType = CertificateAlertEventType.Expiry
): TCertificateAlertForm => ({
  eventType,
  name: "",
  description: "",
  alertBefore: "30d",
  dailyReminder: false,
  enabled: true,
  conditionNames: {},
  channels: []
});
