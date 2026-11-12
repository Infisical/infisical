import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import {
  getIncidentIoErrorMessage,
  listIncidentIoSchedules,
  listIncidentIoShiftsAt,
  TIncidentIoConnection,
  TIncidentIoSchedule
} from "@app/services/app-connection/incident-io";

import {
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AutoApprovalConstraintValue,
  TAutoApprovalProvider
} from "../auto-approval-types";

export enum IncidentIoRequesterConstraint {
  OnCall = "on-call"
}

export type TIncidentIoRequesterFacts = {
  // Only the schedules the policy's rules name
  schedules: { id: string; name: string; onCall: boolean; error: string | null }[];
  // Lowercased names that more than one schedule has
  ambiguousNames: string[];
};

const MAX_OPTIONS = 100;
const MAX_CHECKED_SCHEDULES = 20;
const SCHEDULE_ID_REGEX = new RE2("^[0-9A-Z]{26}$");

const anyOf = (values: string[]) => values.join(" or ");

const countByName = (schedules: TIncidentIoSchedule[]) => {
  const counts = new Map<string, number>();
  schedules.forEach(({ name }) => {
    const key = name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};

// An ID-shaped value only names the schedule with that ID, even once it's deleted, so no schedule can be named after it
const isScheduleId = (value: string) => SCHEDULE_ID_REGEX.test(value);

// A name only counts while no other schedule has it
const getNamedSchedules = <T extends { id: string; name: string }>(
  schedules: T[],
  values: string[],
  ambiguousNames: string[]
) =>
  schedules.filter((schedule) =>
    values.some((value) =>
      isScheduleId(value)
        ? schedule.id === value
        : schedule.name.toLowerCase() === value.toLowerCase() && !ambiguousNames.includes(value.toLowerCase())
    )
  );

const readSchedules = async (conn: TIncidentIoConnection, signal?: AbortSignal) => {
  try {
    return await listIncidentIoSchedules(conn, signal);
  } catch (error) {
    throw new BadRequestError({
      message: `Couldn't read schedules from incident.io: ${getIncidentIoErrorMessage(error)}`
    });
  }
};

export const INCIDENT_IO_AUTO_APPROVAL_PROVIDER: TAutoApprovalProvider<TIncidentIoConnection> = {
  app: AppConnection.IncidentIo,
  subjects: {
    [AUTO_APPROVAL_REQUESTER_SUBJECT]: {
      label: "Requester",
      input: null,
      resolve: async (conn, _id, ctx, valuesByConstraint, deps): Promise<TIncidentIoRequesterFacts> => {
        const values = valuesByConstraint[IncidentIoRequesterConstraint.OnCall] ?? [];
        if (!values.length) return { schedules: [], ambiguousNames: [] };

        const email = ctx.requester.email?.trim().toLowerCase();
        if (!email) throw new BadRequestError({ message: "The requester has no email address to find in incident.io" });

        const all = await readSchedules(conn, deps.signal);
        const counts = countByName(all);
        const ambiguousNames = [
          ...new Set(
            values
              .filter((value) => !isScheduleId(value))
              .map((value) => value.toLowerCase())
              .filter((name) => (counts.get(name) ?? 0) > 1)
          )
        ];
        const named = getNamedSchedules(all, values, ambiguousNames);
        const now = new Date();
        const schedules = await Promise.all(
          named.map(async ({ id, name }) => {
            try {
              const shifts = await listIncidentIoShiftsAt(conn, id, now, deps.signal);
              const onCall = shifts.some((shift) => shift.user?.email?.trim().toLowerCase() === email);
              return { id, name, onCall, error: null };
            } catch (error) {
              return {
                id,
                name,
                onCall: false,
                error: `Couldn't read who is on call in ${name}: ${getIncidentIoErrorMessage(error)}`
              };
            }
          })
        );

        return { schedules, ambiguousNames };
      },
      constraints: {
        [IncidentIoRequesterConstraint.OnCall]: {
          label: "is on call in incident.io schedule",
          value: AutoApprovalConstraintValue.Many,
          maxValues: MAX_CHECKED_SCHEDULES,
          listOptions: async (conn, { search, siblings }, deps) => {
            const schedules = await readSchedules(conn, deps.signal);
            const counts = countByName(schedules);
            const picked = new Set(siblings[IncidentIoRequesterConstraint.OnCall] ?? []);
            return schedules
              .filter(({ id, name }) => picked.has(id) || !search || name.toLowerCase().includes(search.toLowerCase()))
              .sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)) || a.name.localeCompare(b.name))
              .slice(0, MAX_OPTIONS)
              .map(({ id, name }) => ({
                value: id,
                label: (counts.get(name.toLowerCase()) ?? 0) > 1 ? `${name} (${id})` : name
              }));
          },
          describeValues: (facts: TIncidentIoRequesterFacts, values) =>
            values.map((value) => facts.schedules.find((schedule) => schedule.id === value)?.name ?? value),
          test: (facts: TIncidentIoRequesterFacts, values) => {
            const named = getNamedSchedules(facts.schedules, values, facts.ambiguousNames);
            if (named.some((schedule) => schedule.onCall)) return { pass: true };

            const failed = named.find((schedule) => schedule.error);
            if (failed?.error) return { pass: false, reason: failed.error };

            const ambiguous = values.find((value) => facts.ambiguousNames.includes(value.toLowerCase()));
            if (ambiguous) {
              return {
                pass: false,
                reason: `More than one incident.io schedule is named ${ambiguous}. Pick the schedule again so the rule uses its ID.`
              };
            }

            if (!named.length) return { pass: false, reason: `incident.io has no schedule named ${anyOf(values)}` };

            return { pass: false, reason: `The requester isn't on call in ${anyOf(named.map(({ name }) => name))}` };
          }
        }
      }
    }
  }
};
