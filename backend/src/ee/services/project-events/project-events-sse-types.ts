import { Readable } from "node:stream";

import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";

import { ActionProjectType } from "@app/db/schemas";
import { ProjectPermissionSet } from "@app/domains/platform/projects/ce/module";
import { ActorAuthMethod, ActorType } from "@app/lib/auth/actor-types";

import { ProjectEvents } from "./project-events-types";

// Cached permission info
export type TSSEPermissionCache = {
  permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
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
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  actionProjectType: ActionProjectType;
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
