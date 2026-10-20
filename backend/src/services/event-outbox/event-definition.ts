import RE2 from "re2";
import { z } from "zod";

import { TEvent, TEventInput } from "./event-outbox-types";

// The naming and envelope rules from the Event Standards and Versioning ADR, which adopts CloudEvents
// 1.0: an event is named com.infisical.<domain>.<entity>.<action>.v<version>, every segment
// lower-kebab, the entity singular and the action past tense. The version moves only on a breaking
// change to `data`, so adding an optional field is not a new version.
const SEGMENT_PATTERN = new RE2("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");

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

  return {
    type,
    source: `urn:infisical:${domain}`,
    data,
    build: (payload: z.input<TData>): TEventInput => ({ eventType: type, payload })
  };
};

export type TEventDefinition<TData extends z.AnyZodObject> = ReturnType<typeof defineEvent<TData>>;

// The CloudEvents 1.0 envelope with the ADR's constraints. Consumers inside the backend read `TEvent`;
// this is the shape an event takes when it leaves the backend (eg a customer webhook).
export type TCloudEvent<TData> = {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  time: string;
  data: TData;
};

export const toCloudEvent = <TData extends z.AnyZodObject>(
  definition: TEventDefinition<TData>,
  event: TEvent
): TCloudEvent<z.infer<TData>> => {
  if (event.eventType !== definition.type) {
    throw new Error(`Event '${event.eventType}' cannot be read as '${definition.type}'`);
  }
  if (!event.eventId) {
    throw new Error(`Event '${event.id}' was recorded without an eventId, by a release that predates it`);
  }

  return {
    specversion: "1.0",
    id: event.eventId,
    source: definition.source,
    type: definition.type,
    time: new Date(event.occurredAt).toISOString(),
    data: definition.data.parse(event.payload)
  };
};
