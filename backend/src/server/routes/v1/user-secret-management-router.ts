import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";

export const registerUserSecretManagementRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({}),
      response: {
        200: z.object({})
      }
    },
    handler: async () => {}
  });

  server.route({
    method: "POST",
    url: "/create",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        credentialType: z.enum(["WEB_LOGIN", "CREDIT_CARD", "SECURE_NOTE"]),
        username: z.string().optional(),
        password: z.string().optional(),
        cardNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        cvv: z.string().optional(),
        title: z.string().optional(),
        content: z.string().optional(),
        organizationId: z.string(),
        userId: z.string()
      }),
      response: {
        200: z.object({
          message: z.string(),
          secretId: z.number().optional()
        })
      }
    },
    handler: async (req, res) => {
      const newSecret = {
        id: uuidv4(),
        user_id: req.body.userId,
        organization_id: req.body.organizationId,
        type: req.body.credentialType,
        username: req.body.username || null,
        password: req.body.password || null,
        card_number: req.body.cardNumber || null,
        expiry_date: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
        cvv: req.body.cvv || null,
        title: req.body.title || null,
        content: req.body.content || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await server.services.userSecrets.createUserSecret({ secretData: newSecret });
      return res.status(200).send({
        message: "Credential created successfully"
      });
    }
  });
};
