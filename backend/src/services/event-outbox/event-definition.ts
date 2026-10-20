import crypto from "node:crypto";

import { Knex } from "knex";
import RE2 from "re2";
import { z } from "zod";

import { TEventEmitter, TEventInput } from "./event-outbox-types";

// The naming and envelope rules from the Event Standards and Versioning ADR, which adopts CloudEvents
// 1.0: an event is named com.infisical.<domain>.<entity>.<action>.v<version>, every segment
// lower-kebab, the entity singular and the action past tense. The version moves only on a breaking
// change to `data`, so adding an optional field is not a new version.
const SEGMENT_PATTERN = new RE2("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");

// The ADR groups every state change to an entity into one `modified` event, so its data says which kind
// of change it was.
export enum EventModificationType {
  Created = "created",
  Updated = "updated",
  Deleted = "deleted"
}

// Throws at module load, so a name that breaks the convention fails the process on boot rather than
// reaching a request.
export const defineEvent = <TData extends z.AnyZodObject>({
  domain,
  entity,
  action,
  version,
  data
}: {
  domain: string;
  entity: string;
  action: string;
  version: number;
  data: TData;
}) => {
  Object.entries({ domain, entity, action }).forEach(([segment, value]) => {
    if (!SEGMENT_PATTERN.test(value)) {
      throw new Error(`Event ${segment} '${value}' must be lower-kebab-case, e.g. 'secret-import'`);
    }
  });
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Event version '${version}' must be a positive integer`);
  }

  const type = `com.infisical.${domain}.${entity}.${action}.v${version}`;
  const build = (eventData: z.input<TData>): TEventInput => ({ id: crypto.randomUUID(), type, data: eventData });

  return {
    type,
    data,
    build,
    emit: (eventEmitter: TEventEmitter, eventData: z.input<TData>, tx?: Knex): Promise<void> =>
      eventEmitter.emit([build(eventData)], tx)
  };
};

export type TEventDefinition<TData extends z.AnyZodObject> = ReturnType<typeof defineEvent<TData>>;

// `urn:infisical:<domain>`. Events named before the ADR (eg `identity.authentication.auth-method-changed`)
// have no domain segment, so their first segment stands in for it.
export const eventSource = (type: string): string => {
  const segments = type.split(".");
  const domain = type.startsWith("com.infisical.") ? segments[2] : segments[0];
  return `urn:infisical:${domain}`;
};
