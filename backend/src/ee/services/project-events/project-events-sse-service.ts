import { Readable } from "node:stream";

import { ForbiddenError, subject } from "@casl/ability";
import { nanoid } from "nanoid";
import picomatch from "picomatch";

import { ProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretEventActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, RateLimitError } from "@app/lib/errors";
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
const HEARTBEAT_INTERVAL = 60 * 1000; // 60 seconds
const PING_INTERVAL = 15 * 1000; // 15 seconds
const MAX_CONNECTIONS_PER_PROJECT = 100;
const CONNECTION_TTL_SECONDS = KeyStoreTtls.ProjectSSEConnectionTtlSeconds;

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
  keyStore: TKeyStoreFactory;
};

export const projectEventsSSEServiceFactory = ({
  projectEventsService,
  permissionService,
  licenseService,
  keyStore
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

  // Connection management functions for rate limiting
  const $registerConnection = async (projectId: string, connectionId: string): Promise<void> => {
    const set = KeyStorePrefixes.ProjectSSEConnectionsSet(projectId);
    const key = KeyStorePrefixes.ProjectSSEConnection(projectId, connectionId);
    await keyStore.setItemWithExpiry(key, CONNECTION_TTL_SECONDS, "1");
    await keyStore.listPush(set, connectionId);
  };

  const $refreshConnection = async (projectId: string, connectionId: string): Promise<void> => {
    const key = KeyStorePrefixes.ProjectSSEConnection(projectId, connectionId);
    await keyStore.setItemWithExpiry(key, CONNECTION_TTL_SECONDS, "1");
  };

  const $removeConnection = async (projectId: string, connectionId: string): Promise<void> => {
    try {
      const set = KeyStorePrefixes.ProjectSSEConnectionsSet(projectId);
      const key = KeyStorePrefixes.ProjectSSEConnection(projectId, connectionId);
      await keyStore.listRemove(set, 0, connectionId);
      await keyStore.deleteItem(key);
    } catch (error) {
      logger.error(error, "Failed to remove SSE connection from keystore");
    }
  };

  const getActiveConnectionsCountFromKeyStore = async (projectId: string): Promise<number> => {
    const set = KeyStorePrefixes.ProjectSSEConnectionsSet(projectId);
    const connections = await keyStore.listRange(set, 0, -1);

    if (connections.length === 0) {
      return 0;
    }

    // Check which connections are alive (have valid TTL keys)
    const keys = connections.map((c) => KeyStorePrefixes.ProjectSSEConnection(projectId, c));
    const values = await keyStore.getItems(keys);

    // Clean up stale connections (crashed servers - expired TTL keys)
    const staleConnections = connections.filter((_, i) => values[i] === null);
    for await (const staleConnection of staleConnections) {
      await keyStore.listRemove(set, 0, staleConnection);
    }

    return connections.length - staleConnections.length;
  };

  // Heartbeat interval to keep connections alive
  const heartbeatInterval = setInterval(() => {
    for (const [clientId, { client, opts }] of clients) {
      if (!client.stream.closed) {
        void $refreshConnection(opts.projectId, clientId);
      }
    }
  }, HEARTBEAT_INTERVAL);

  const pingInterval = setInterval(() => {
    for (const [, el] of clients) {
      if (!el.client.stream.closed) {
        el.client.ping();
      }
    }
  }, PING_INTERVAL);

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
  const $refreshPermission = async (clientId: string): Promise<void> => {
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
        void $refreshPermission(clientId);
      }
    }
  }, PERMISSION_REFRESH_INTERVAL);

  /**
   * Check if client has permission to receive this event based on registrations
   * This is called for each incoming event - returns boolean, does not throw
   */
  const $canReceiveEvent = (
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
      if (
        reg.conditions?.secretPath &&
        !picomatch.isMatch(payload.secretPath, reg.conditions.secretPath, { strictSlashes: false })
      ) {
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

    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectSSEConnectionsLockoutKey(opts.projectId)], 150, {
        retryCount: -1,
        retryDelay: 200,
        retryJitter: 50
      })
      .catch(() => null);
    try {
      // Rate limit check
      const activeCount = await getActiveConnectionsCountFromKeyStore(opts.projectId);
      if (activeCount >= MAX_CONNECTIONS_PER_PROJECT) {
        throw new RateLimitError({
          message: `You have reached your maximum concurrent event subscriptions for this project. Your project supports ${MAX_CONNECTIONS_PER_PROJECT} concurrent event subscriptions.`
        });
      }

      // Register connection in keystore
      await $registerConnection(opts.projectId, id);
    } finally {
      await lock?.release();
    }

    // Create the readable stream
    const stream = new Readable({ objectMode: true, read: () => {} });

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
    const unsubscribe = projectEventsService.subscribe(async (payload) => {
      const currentEntry = clients.get(id);
      if (!currentEntry) return;

      // Filter by projectId first
      if (payload.projectId !== opts.projectId) return;

      // Check permission and registered events/conditions
      if (!$canReceiveEvent(currentEntry.permissionCache, payload, opts.register)) {
        return;
      }

      const payloadFormattedData = {
        projectType: ProjectType.SecretManager,
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
          secretKey: key
        }));
      }

      // Send event to client
      send({
        id: Date.now().toString(),
        type: payload.type,
        data: payloadFormattedData
      });
    });

    // Cleanup function that's safe to call multiple times
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      unsubscribe();
      clients.delete(id);
      void $removeConnection(opts.projectId, id);
    };

    // Handle stream errors - ensure cleanup even if "close" doesn't fire
    stream.on("error", (error: Error) => {
      if ((error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE") {
        logger.error(error, "SSE stream error");
      }
      cleanup();
      stream.destroy(error);
    });

    // Clean up on stream close
    stream.on("close", () => {
      cleanup();
    });

    return client;
  };

  /**
   * Close all connections and clean up
   */
  const close = async () => {
    clearInterval(heartbeatInterval);
    clearInterval(pingInterval);
    clearInterval(refreshInterval);

    // Clean up keystore connections
    const cleanupPromises: Promise<void>[] = [];
    for (const [clientId, { client, opts }] of clients) {
      client.close();
      cleanupPromises.push($removeConnection(opts.projectId, clientId));
    }
    await Promise.all(cleanupPromises);

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
