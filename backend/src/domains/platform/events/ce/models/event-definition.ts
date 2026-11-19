import crypto from "node:crypto";

import RE2 from "re2";
import { z } from "zod";

import { TEventInput } from "./emitted-event";

// Naming per the Event Standards and Versioning ADR (CloudEvents 1.0):
// com.infisical.<domain>.<entity>.<action>.v<version>. Segments are lower-kebab, entity singular, action past
// tense. Only bump the version on a breaking change to `data` (a new optional field isn't one).
const SEGMENT_PATTERN = new RE2("^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");

// Create, update and delete share one `modified` event, so the data says which it was.
export enum EventModificationType {
  Created = "created",
  Updated = "updated",
  Deleted = "deleted"
}

export type TEventDefinitionRecord<TData extends z.AnyZodObject> = {
  domain: string;
  entity: string;
  action: string;
  version: number;
  data: TData;
};

export class EventDefinition<TData extends z.AnyZodObject> {
  private constructor(
    readonly type: string,
    readonly data: TData
  ) {}

  // Throws at module load, so a bad name fails on boot instead of on a request.
  static define<TData extends z.AnyZodObject>({
    domain,
    entity,
    action,
    version,
    data
  }: TEventDefinitionRecord<TData>): EventDefinition<TData> {
    Object.entries({ domain, entity, action }).forEach(([segment, value]) => {
      if (!SEGMENT_PATTERN.test(value)) {
        throw new Error(`Event ${segment} '${value}' must be lower-kebab-case, e.g. 'secret-import'`);
      }
    });
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`Event version '${version}' must be a positive integer`);
    }

    return new EventDefinition(`com.infisical.${domain}.${entity}.${action}.v${version}`, data);
  }

  // Pre-ADR names like `identity.authentication.auth-method-changed` have no domain segment, so use the first.
  static sourceOf(type: string): string {
    const segments = type.split(".");
    const domain = type.startsWith("com.infisical.") ? segments[2] : segments[0];
    return `urn:infisical:${domain}`;
  }

  build(eventData: z.input<TData>): TEventInput {
    return { id: crypto.randomUUID(), type: this.type, data: eventData };
  }
}
