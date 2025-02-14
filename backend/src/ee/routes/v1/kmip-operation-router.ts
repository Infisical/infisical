import crypto from "crypto";
import jwt, { JwtPayload } from "jsonwebtoken";
import z from "zod";

import { KmsKeysSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SymmetricEncryption } from "@app/lib/crypto/cipher";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { writeLimit } from "@app/server/config/rateLimiter";
import { ActorType } from "@app/services/auth/auth-type";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

export const registerKmipOperationRouter = async (server: FastifyZodProvider) => {
  server.decorateRequest("kmipUser", null);

  server.addHook("preHandler", async (req) => {
    const token = req.headers["x-kmip-jwt"] as string;
    const serverCertSerialNumber = req.headers["x-server-certificate-serial-number"] as string;

    if (!jwt) {
      throw new ForbiddenRequestError({
        message: "Missing KMIP JWT"
      });
    }

    if (!serverCertSerialNumber) {
      throw new ForbiddenRequestError({
        message: "Missing server certificate serial number from request"
      });
    }

    const serverCert = await server.services.kmip.getServerCertificateBySerialNumber(serverCertSerialNumber);

    // TODO: assert that server certificate used is not revoked
    // TODO: assert that client certificate used is not revoked

    const publicKey = crypto.createPublicKey({
      key: serverCert.publicKey,
      format: "pem",
      type: [CertKeyAlgorithm.ECDSA_P256, CertKeyAlgorithm.ECDSA_P384].includes(serverCert.keyAlgorithm)
        ? "spki"
        : "pkcs1"
    });

    const decodedToken = jwt.verify(token, publicKey) as JwtPayload & { projectId: string; clientId: string };

    const kmipClient = await server.store.kmipClient.findOne({
      id: decodedToken.clientId,
      projectId: decodedToken.projectId
    });

    if (!kmipClient) {
      throw new NotFoundError({
        message: "KMIP client cannot be found."
      });
    }

    req.kmipUser = {
      projectId: decodedToken.projectId,
      clientId: decodedToken.clientId,
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
        algorithm: z.nativeEnum(SymmetricEncryption)
      }),
      response: {
        200: KmsKeysSchema
      }
    },
    handler: async (req) => {
      const object = await server.services.kmipOperation.create({
        ...req.kmipUser,
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
          algorithm: z.string()
        })
      }
    },
    handler: async (req) => {
      const object = await server.services.kmipOperation.get({
        ...req.kmipUser,
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
          updatedAt: z.date()
        })
      }
    },
    handler: async (req) => {
      const object = await server.services.kmipOperation.getAttributes({
        ...req.kmipUser,
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
    handler: async (req) => {
      const object = await server.services.kmipOperation.deleteOp({
        ...req.kmipUser,
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
          type: EventType.KMIP_OPERATION_DELETE,
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
    handler: async (req) => {
      const object = await server.services.kmipOperation.activate({
        ...req.kmipUser,
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
    handler: async (req) => {
      const object = await server.services.kmipOperation.revoke({
        ...req.kmipUser,
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
              updatedAt: z.date()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const objects = await server.services.kmipOperation.locate({
        ...req.kmipUser
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
        algorithm: z.nativeEnum(SymmetricEncryption)
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    handler: async (req) => {
      const object = await server.services.kmipOperation.register({
        ...req.kmipUser,
        ...req.body
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
