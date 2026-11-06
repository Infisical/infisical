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

const anyOf = (values: string[]) => values.join(" or ");

const countByName = (schedules: TIncidentIoSchedule[]) => {
  const counts = new Map<string, number>();
  schedules.forEach(({ name }) => {
    const key = name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
};

// A name only identifies a schedule while no other schedule has it; an ID always does
const isNamedBy = (schedule: { id: string; name: string }, value: string, ambiguousNames: string[]) =>
  schedule.id === value ||
  (schedule.name.toLowerCase() === value.toLowerCase() && !ambiguousNames.includes(value.toLowerCase()));

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
      resolve: async (conn, _id, ctx, _constraintIds, deps, valuesByConstraint): Promise<TIncidentIoRequesterFacts> => {
        const values = valuesByConstraint[IncidentIoRequesterConstraint.OnCall] ?? [];
        if (!values.length) return { schedules: [], ambiguousNames: [] };

        const email = ctx.requester.email?.trim().toLowerCase();
        if (!email) throw new BadRequestError({ message: "The requester has no email address to find in incident.io" });

        const all = await readSchedules(conn, deps.signal);
        const counts = countByName(all);
        const ambiguousNames = [
          ...new Set(values.map((value) => value.toLowerCase()).filter((name) => (counts.get(name) ?? 0) > 1))
        ];
        const named = all.filter((schedule) => values.some((value) => isNamedBy(schedule, value, ambiguousNames)));
        if (named.length > MAX_CHECKED_SCHEDULES) {
          throw new BadRequestError({
            message: `The rules name ${named.length} incident.io schedules, and Infisical checks at most ${MAX_CHECKED_SCHEDULES}`
          });
        }

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
          listOptions: async (conn, { search }, deps) => {
            const schedules = await readSchedules(conn, deps.signal);
            const counts = countByName(schedules);
            return schedules
              .filter(({ name }) => !search || name.toLowerCase().includes(search.toLowerCase()))
              .sort((a, b) => a.name.localeCompare(b.name))
              .slice(0, MAX_OPTIONS)
              .map(({ id, name }) =>
                (counts.get(name.toLowerCase()) ?? 0) > 1
                  ? { value: id, label: `${name} (${id})` }
                  : { value: name, label: name }
              );
          },
          test: (facts: TIncidentIoRequesterFacts, values) => {
            const named = facts.schedules.filter((schedule) =>
              values.some((value) => isNamedBy(schedule, value, facts.ambiguousNames))
            );
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
