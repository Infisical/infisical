import { Readable } from "node:stream";

import { ForbiddenError, subject } from "@casl/ability";
import { nanoid } from "nanoid";

import { ProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretEventActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { TLicenseServiceFactory } from "../license/license-service";
import { TProjectEventsService } from "./project-events-service";
import {
  TSSEClient,
  TSSEEvent,
  TSSEPermissionCache,
  TSSERegisterEntry,
  TSSESubscribeOpts
} from "./project-events-sse-types";
import { ProjectEvents, TProjectEventPayload } from "./project-events-types";

const PERMISSION_REFRESH_INTERVAL = 60 * 1000; // 60 seconds
const HEARTBEAT_INTERVAL = 15 * 1000; // 15 seconds

// Map mutation type to permission action
const MutationTypeToAction: Record<ProjectEvents, ProjectPermissionSecretEventActions> = {
  [ProjectEvents.SecretCreate]: ProjectPermissionSecretEventActions.SubscribeCreated,
  [ProjectEvents.SecretUpdate]: ProjectPermissionSecretEventActions.SubscribeUpdated,
  [ProjectEvents.SecretDelete]: ProjectPermissionSecretEventActions.SubscribeDeleted,
  [ProjectEvents.SecretImportMutation]: ProjectPermissionSecretEventActions.SubscribeImportMutations
};

const getBusEventToSubject = (type: ProjectEvents) => {
  if (
    [
      ProjectEvents.SecretCreate,
      ProjectEvents.SecretUpdate,
      ProjectEvents.SecretDelete,
      ProjectEvents.SecretImportMutation
    ].includes(type)
  ) {
    return ProjectPermissionSub.SecretEvents;
  }
  throw new Error("Unknown project event type");
};

// SSE event serialization
function serializeSSEEvent(event: TSSEEvent): string {
  let payload = "";
  if (event.id) payload += `id: ${event.id}\n`;
  if (event.type) payload += `event: ${event.type}\n`;
  if (event.data) payload += `data: ${JSON.stringify(event.data)}\n`;
  return `${payload}\n`;
}

// SSE Headers
export const getSSEHeaders = () =>
  ({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  }) as const;

type TProjectEventsSSEServiceFactoryDep = {
  projectEventsService: TProjectEventsService;
  permissionService: TPermissionServiceFactory;
  licenseService: TLicenseServiceFactory;
};

export const projectEventsSSEServiceFactory = ({
  projectEventsService,
  permissionService,
  licenseService
}: TProjectEventsSSEServiceFactoryDep) => {
  // Map: clientId -> { client, opts, permissionCache }
  const clients = new Map<
    string,
    {
      client: TSSEClient;
      opts: TSSESubscribeOpts;
      permissionCache: TSSEPermissionCache;
      send: (event: TSSEEvent) => void;
    }
  >();

  // Heartbeat interval to keep connections alive
  const heartbeatInterval = setInterval(() => {
    for (const [, { client }] of clients) {
      if (!client.stream.closed) {
        client.ping();
      }
    }
  }, HEARTBEAT_INTERVAL);

  /**
   * Fetch fresh permission from permission service
   */
  const fetchPermission = async (opts: TSSESubscribeOpts): Promise<TSSEPermissionCache> => {
    const { permission } = await permissionService.getProjectPermission({
      actor: opts.actor,
      actorId: opts.actorId,
      projectId: opts.projectId,
      actorAuthMethod: opts.actorAuthMethod,
      actorOrgId: opts.actorOrgId,
      actionProjectType: opts.actionProjectType
    });

    return {
      permission,
      fetchedAt: Date.now()
    };
  };

  /**
   * Validate that user has permission for all registered events
   * Throws ForbiddenError if any registration is not permitted
   */
  const validateRegisteredPermissions = (permissionCache: TSSEPermissionCache, register: TSSERegisterEntry[]): void => {
    for (const reg of register) {
      const permissionSubject = getBusEventToSubject(reg.event);
      const action = MutationTypeToAction[reg.event];

      // Use registration's conditions for permission check
      const subjectFields = {
        environment: reg.conditions?.environmentSlug ?? "",
        secretPath: reg.conditions?.secretPath ?? "/"
      };

      ForbiddenError.from(permissionCache.permission).throwUnlessCan(
        // @ts-expect-error - permissionSubject is narrowed by getBusEventToSubject but TS doesn't infer it
        action,
        subject(permissionSubject, subjectFields)
      );
    }
  };

  /**
   * Refresh permission for a client
   * Also re-validates registered permissions - closes connection if revoked
   */
  const refreshPermission = async (clientId: string): Promise<void> => {
    const entry = clients.get(clientId);
    if (!entry) return;

    try {
      const newPermissionCache = await fetchPermission(entry.opts);

      // Re-validate registered permissions with refreshed permissions
      validateRegisteredPermissions(newPermissionCache, entry.opts.register);

      entry.permissionCache = newPermissionCache;
    } catch (error) {
      logger.error(error, "Failed to refresh SSE client permission or permission revoked");
      entry.send({ type: "error", data: { message: "Permission denied or refresh failed" } });
      entry.client.close();
      clients.delete(clientId);
    }
  };

  // Permission refresh interval
  const refreshInterval = setInterval(() => {
    for (const [clientId, entry] of clients) {
      if (!entry.client.stream.closed) {
        void refreshPermission(clientId);
      }
    }
  }, PERMISSION_REFRESH_INTERVAL);

  /**
   * Check if client has permission to receive this event based on registrations
   * This is called for each incoming event - returns boolean, does not throw
   */
  const canReceiveEvent = (
    permissionCache: TSSEPermissionCache,
    payload: TProjectEventPayload,
    register: TSSERegisterEntry[]
  ): boolean => {
    // Find matching registration for this event type
    const matchingRegistrations = register.filter((r) => r.event === payload.type);
    if (matchingRegistrations.length === 0) {
      return false;
    }

    return matchingRegistrations.some((reg) => {
      // If conditions specified, check they match
      if (reg.conditions?.environmentSlug && payload.environment !== reg.conditions.environmentSlug) {
        return false;
      }
      if (reg.conditions?.secretPath && !payload.secretPath.startsWith(reg.conditions.secretPath)) {
        return false;
      }

      // Check permission using CASL against the actual event's environment/path
      const action = MutationTypeToAction[payload.type];
      const subjectFields = {
        environment: payload.environment,
        secretPath: payload.secretPath
      };

      return permissionCache.permission.can(action, subject(ProjectPermissionSub.SecretEvents, subjectFields));
    });
  };

  /**
   * Subscribe a client to receive secret mutation events
   * Returns the SSE client for the router to use
   */
  const subscribe = async (opts: TSSESubscribeOpts): Promise<TSSEClient> => {
    const id = `sse-${nanoid()}`;

    // Fetch initial permission (throws if not authorized)
    const permissionCache = await fetchPermission(opts);

    // Validate user has permission for all registered events (throws ForbiddenError if not)
    validateRegisteredPermissions(permissionCache, opts.register);

    const plan = await licenseService.getPlan(opts.actorOrgId);
    if (!plan.eventSubscriptions) {
      throw new BadRequestError({
        message: "Event subscriptions are not available on your current plan. Please upgrade to access this feature."
      });
    }

    // Create the readable stream
    const stream = new Readable({ objectMode: true });
    // eslint-disable-next-line no-underscore-dangle
    stream._read = () => {}; // Manual push mode

    const send = (event: TSSEEvent) => {
      const chunk = serializeSSEEvent(event);
      if (!stream.push(chunk)) {
        logger.debug("SSE backpressure detected: event dropped");
      }
    };

    const ping = () => {
      send({ type: "ping" });
    };

    const close = () => {
      if (stream.closed) return;
      stream.push(null);
      stream.destroy();
    };

    stream.on("error", (error: Error) => {
      logger.error(error, "SSE stream error");
      stream.destroy(error);
    });

    const client: TSSEClient = {
      id,
      stream,
      projectId: opts.projectId,
      actorId: opts.actorId,
      ping,
      close
    };

    // Store client with its opts and permission cache
    const entry = { client, opts, permissionCache, send };
    clients.set(id, entry);

    // Subscribe to secret mutations and filter for this client
    const unsubscribe = projectEventsService.subscribe((payload) => {
      const currentEntry = clients.get(id);
      if (!currentEntry) return;

      // Filter by projectId first
      if (payload.projectId !== opts.projectId) return;

      // Check permission and registered events/conditions
      if (!canReceiveEvent(currentEntry.permissionCache, payload, opts.register)) {
        return;
      }

      const payloadFormattedData = {
        type: ProjectType.SecretManager,
        data: { eventType: payload.type, payload: {} }
      };
      if (payload.type === ProjectEvents.SecretImportMutation) {
        payloadFormattedData.data.payload = {
          environment: payload.environment,
          secretPath: payload.secretPath
        };
      } else if (
        payload.type === ProjectEvents.SecretCreate ||
        payload.type === ProjectEvents.SecretUpdate ||
        payload.type === ProjectEvents.SecretDelete
      ) {
        payloadFormattedData.data.payload = payload.secretKeys.map((key) => ({
          environment: payload.environment,
          secretPath: payload.secretPath,
          secretKeys: key
        }));
      }

      // Send event to client
      send({
        id: Date.now().toString(),
        type: payload.type,
        data: payloadFormattedData
      });
    });

    // Clean up on stream close
    stream.on("close", () => {
      unsubscribe();
      clients.delete(id);
    });

    return client;
  };

  /**
   * Close all connections and clean up
   */
  const close = () => {
    clearInterval(heartbeatInterval);
    clearInterval(refreshInterval);

    for (const [, { client }] of clients) {
      client.close();
    }
    clients.clear();
  };

  /**
   * Get count of active connections for a project/actor
   */
  const getActiveConnectionsCount = (projectId: string, actorId: string): number => {
    let count = 0;
    for (const [, { client }] of clients) {
      if (client.projectId === projectId && client.actorId === actorId) {
        count += 1;
      }
    }
    return count;
  };

  return {
    subscribe,
    close,
    getActiveConnectionsCount,
    getSSEHeaders
  };
};

export type TProjectEventsSSEService = ReturnType<typeof projectEventsSSEServiceFactory>;
