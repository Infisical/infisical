import { Readable } from "node:stream";

import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";

import { ActionProjectType } from "@app/db/schemas";
import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

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
};

// SSE Event format
export type TSSEEvent = {
  id?: string;
  type: string;
  data?: object;
};
