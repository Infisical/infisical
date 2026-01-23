import z from "zod";

import { KmsKeysSchema } from "@app/db/schemas/kms-keys";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

export const registerKmipSpecRouter = async (server: FastifyZodProvider) => {
  server.decorateRequest("kmipUser", null);

  server.addHook("onRequest", async (req) => {
    const clientId = req.headers["x-kmip-client-id"] as string;
    const projectId = req.headers["x-kmip-project-id"] as string;
    const clientCertSerialNumber = req.headers["x-kmip-client-certificate-serial-number"] as string;
    const serverCertSerialNumber = req.headers["x-kmip-server-certificate-serial-number"] as string;

    if (!serverCertSerialNumber) {
      throw new ForbiddenRequestError({
        message: "Missing server certificate serial number from request"
      });
    }

    if (!clientCertSerialNumber) {
      throw new ForbiddenRequestError({
        message: "Missing client certificate serial number from request"
      });
    }

    if (!clientId) {
      throw new ForbiddenRequestError({
        message: "Missing client ID from request"
      });
    }

    if (!projectId) {
      throw new ForbiddenRequestError({
        message: "Missing project ID from request"
      });
    }

    // TODO: assert that server certificate used is not revoked
    // TODO: assert that client certificate used is not revoked

    const kmipClient = await server.store.kmipClient.findByProjectAndClientId(projectId, clientId);

    if (!kmipClient) {
      throw new NotFoundError({
        message: "KMIP client cannot be found."
      });
    }

    if (kmipClient.orgId !== req.permission.orgId) {
      throw new ForbiddenRequestError({
        message: "Client specified in the request does not belong in the organization"
      });
    }

    req.kmipUser = {
      projectId,
      clientId,
      name: kmipClient.name
    };
  });

  server.route({
    method: "POST",
    url: "/create",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for creating managed objects",
      body: z.object({
        algorithm: z.nativeEnum(SymmetricKeyAlgorithm)
      }),
      response: {
        200: KmsKeysSchema
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const object = await server.services.kmipOperation.create({
        ...req.kmipUser,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        algorithm: req.body.algorithm
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_CREATE,
          metadata: {
            id: object.id,
            algorithm: req.body.algorithm
          }
        }
      });

      return object;
    }
  });

  server.route({
    method: "POST",
    url: "/get",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for getting managed objects",
      body: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          id: z.string(),
          value: z.string(),
          algorithm: z.string(),
          kmipMetadata: z.record(z.any()).nullish()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const object = await server.services.kmipOperation.get({
        ...req.kmipUser,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.body.id
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_GET,
          metadata: {
            id: object.id
          }
        }
      });

      return object;
    }
  });

  server.route({
    method: "POST",
    url: "/get-attributes",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for getting attributes of managed object",
      body: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          id: z.string(),
          algorithm: z.string(),
          isActive: z.boolean(),
          createdAt: z.date(),
          updatedAt: z.date(),
          kmipMetadata: z.record(z.any()).nullish()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const object = await server.services.kmipOperation.getAttributes({
        ...req.kmipUser,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.body.id
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_GET_ATTRIBUTES,
          metadata: {
            id: object.id
          }
        }
      });

      return object;
    }
  });

  server.route({
    method: "POST",
    url: "/destroy",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for destroying managed objects",
      body: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const object = await server.services.kmipOperation.destroy({
        ...req.kmipUser,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.body.id
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_DESTROY,
          metadata: {
            id: object.id
          }
        }
      });

      return object;
    }
  });

  server.route({
    method: "POST",
    url: "/activate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for activating managed object",
      body: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          id: z.string(),
          isActive: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const object = await server.services.kmipOperation.activate({
        ...req.kmipUser,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.body.id
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_ACTIVATE,
          metadata: {
            id: object.id
          }
        }
      });

      return object;
    }
  });

  server.route({
    method: "POST",
    url: "/revoke",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for revoking managed object",
      body: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          id: z.string(),
          updatedAt: z.date()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const object = await server.services.kmipOperation.revoke({
        ...req.kmipUser,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.body.id
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_REVOKE,
          metadata: {
            id: object.id
          }
        }
      });

      return object;
    }
  });

  server.route({
    method: "POST",
    url: "/locate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for locating managed objects",
      response: {
        200: z.object({
          objects: z
            .object({
              id: z.string(),
              name: z.string(),
              isActive: z.boolean(),
              algorithm: z.string(),
              createdAt: z.date(),
              updatedAt: z.date(),
              kmipMetadata: z.record(z.any()).nullish()
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const objects = await server.services.kmipOperation.locate({
        ...req.kmipUser,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_LOCATE,
          metadata: {
            ids: objects.map((obj) => obj.id)
          }
        }
      });

      return {
        objects
      };
    }
  });

  server.route({
    method: "POST",
    url: "/register",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "KMIP endpoint for registering managed object",
      body: z.object({
        key: z.string(),
        name: z.string(),
        algorithm: z.nativeEnum(SymmetricKeyAlgorithm),
        kmipMetadata: z.record(z.any()).nullish()
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const object = await server.services.kmipOperation.register({
        ...req.kmipUser,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.kmipUser.projectId,
        actor: {
          type: ActorType.KMIP_CLIENT,
          metadata: {
            clientId: req.kmipUser.clientId,
            name: req.kmipUser.name
          }
        },
        event: {
          type: EventType.KMIP_OPERATION_REGISTER,
          metadata: {
            id: object.id,
            algorithm: req.body.algorithm,
            name: object.name
          }
        }
      });

      return object;
    }
  });
};
