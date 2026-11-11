import { Readable } from "node:stream";

import { TActorContext } from "@app/domains/lib/actor-context";
import { ProjectPermission } from "@app/domains/platform/projects/ce/module";

import { ProjectEvents } from "./project-events-types";

// Cached permission info
export type TSSEPermissionCache = {
  permission: ProjectPermission;
  fetchedAt: number;
};

// Registration entry for event subscription
export type TSSERegisterEntry = {
  event: ProjectEvents;
  conditions?: {
    environmentSlug?: string;
    secretPath?: string;
  };
};

// Options for subscribing to SSE events
export type TSSESubscribeOpts = {
  projectId: string;
  actor: TActorContext;
  // Event registrations with optional conditions
  register: TSSERegisterEntry[];
};

// SSE Client interface
export type TSSEClient = {
  id: string;
  stream: Readable;
  projectId: string;
  actorId: string;
  ping: () => void;
  close: () => void;
  unsubscribe: () => void;
};

// SSE Event format
export type TSSEEvent = {
  id?: string;
  type: string;
  data?: object;
};
