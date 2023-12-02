import { Types } from "mongoose";
import { ISecret, IServiceTokenData, IUser, Secret } from "../models";
import { validateUserClientForSecret, validateUserClientForSecrets } from "./user";
import {
  validateServiceTokenDataClientForSecrets,
  validateServiceTokenDataClientForWorkspace
} from "./serviceTokenData";
import { BadRequestError, SecretNotFoundError } from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";
import { z } from "zod";
import { SECRET_PERSONAL, SECRET_SHARED } from "../variables";
/**
 * Validate authenticated clients for secrets with id [secretId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.secretId - id of secret to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForSecret = async ({
  authData,
  secretId,
  acceptedRoles,
  requiredPermissions
}: {
  authData: AuthData;
  secretId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
  requiredPermissions: string[];
}) => {
  const secret = await Secret.findById(secretId);

  if (!secret)
    throw SecretNotFoundError({
      message: "Failed to find secret"
    });

  switch (authData.actor.type) {
    case ActorType.USER:
      await validateUserClientForSecret({
        user: authData.authPayload as IUser,
        secret,
        acceptedRoles,
        requiredPermissions
      });

      return secret;
    case ActorType.SERVICE:
      await validateServiceTokenDataClientForWorkspace({
        serviceTokenData: authData.authPayload as IServiceTokenData,
        workspaceId: secret.workspace,
        environment: secret.environment
      });

      return secret;
  }
};

/**
 * Validate authenticated clients for secrets with ids [secretIds] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId[]} obj.secretIds - id of workspace to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForSecrets = async ({
  authData,
  secretIds,
  requiredPermissions
}: {
  authData: AuthData;
  secretIds: Types.ObjectId[];
  requiredPermissions: string[];
}) => {
  let secrets: ISecret[] = [];

  secrets = await Secret.find({
    _id: {
      $in: secretIds
    }
  });

  if (secrets.length != secretIds.length) {
    throw BadRequestError({ message: "Failed to validate non-existent secrets" });
  }

  switch (authData.actor.type) {
    case ActorType.USER:
      await validateUserClientForSecrets({
        user: authData.authPayload as IUser,
        secrets,
        requiredPermissions
      });

      return secrets;
    case ActorType.SERVICE:
      await validateServiceTokenDataClientForSecrets({
        serviceTokenData: authData.authPayload as IServiceTokenData,
        secrets,
        requiredPermissions
      });

      return secrets;
  }
};

export const GetSecretVersionsV1 = z.object({
  params: z.object({
    secretId: z.string().trim()
  }),
  query: z.object({
    offset: z.coerce.number(),
    limit: z.coerce.number()
  })
});

export const RollbackSecretVersionV1 = z.object({
  params: z.object({
    secretId: z.string().trim()
  }),
  body: z.object({
    version: z.number()
  })
});

export const PushSecretsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    secrets: z.object({}).array(),
    keys: z.object({}).array(),
    environment: z.string().trim(),
    channel: z.string().trim()
  })
});

export const PullSecretsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  query: z.object({
    channel: z.string().optional(),
    environment: z.string().trim()
  })
});

export const PullSecretsServiceTokenV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  query: z.object({
    channel: z.string().optional(),
    environment: z.string().trim()
  })
});

const batchUpdateRequestV2 = z.object({
  _id: z.string(),
  folderId: z.string().trim().optional(),
  type: z.enum(["shared", "personal"]),
  secretName: z.string().trim(),
  secretKeyCiphertext: z.string().trim(),
  secretKeyIV: z.string().trim(),
  secretKeyTag: z.string().trim(),
  secretValueCiphertext: z.string().trim(),
  secretValueIV: z.string().trim(),
  secretValueTag: z.string().trim(),
  secretCommentCiphertext: z.string().trim().optional(),
  secretCommentIV: z.string().trim().optional(),
  secretCommentTag: z.string().trim().optional(),
  tags: z
    .object({
      _id: z.string().trim(),
      name: z.string().trim(),
      slug: z.string().trim()
    })
    .array()
});

export const BatchSecretsV2 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    folderId: z.string().trim().default("root"),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    requests: z
      .discriminatedUnion("method", [
        z.object({
          method: z.literal("POST"),
          secret: batchUpdateRequestV2.omit({ _id: true })
        }),
        z.object({
          method: z.literal("PATCH"),
          secret: batchUpdateRequestV2
        }),
        z.object({
          method: z.literal("DELETE"),
          secret: z.object({ _id: z.string().trim(), secretName: z.string().trim() })
        })
      ])
      .array()
  })
});

export const GetSecretsV2 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    tagSlugs: z.string().trim().optional(),
    folderId: z.string().trim().default("root"),
    secretPath: z.string().trim().optional(),
    include_imports: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true")
  })
});

export const GetSecretsRawV3 = z.object({
  query: z.object({
    workspaceId: z.string().trim().optional(),
    environment: z.string().trim().optional(),
    secretPath: z.string().trim().default("/"),
    include_imports: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true")
  })
});

export const GetSecretByNameRawV3 = z.object({
  params: z.object({
    secretName: z.string().trim()
  }),
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL]).optional(),
    include_imports: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true")
  })
});

export const CreateSecretRawV3 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    secretValue: z
      .string()
      .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())),
    secretComment: z.string().trim().optional().default(""),

    skipMultilineEncoding: z.boolean().optional(),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL])
  }),
  params: z.object({
    secretName: z.string().trim()
  })
});

export const UpdateSecretByNameRawV3 = z.object({
  params: z.object({
    secretName: z.string().trim()
  }),
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),

    secretValue: z
      .string()
      .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())),
    secretPath: z.string().trim().default("/"),
    skipMultilineEncoding: z.boolean().optional(),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL]).default(SECRET_SHARED)
  })
});

export const DeleteSecretByNameRawV3 = z.object({
  params: z.object({
    secretName: z.string().trim()
  }),
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL]).default(SECRET_SHARED)
  })
});

export const GetSecretsV3 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    include_imports: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true")
  })
});

export const GetSecretByNameV3 = z.object({
  query: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL]).optional(),
    include_imports: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true")
  }),
  params: z.object({
    secretName: z.string().trim()
  })
});

export const CreateSecretV3 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL]),
    secretPath: z.string().trim().default("/"),
    secretKeyCiphertext: z.string().trim(),
    secretKeyIV: z.string().trim(),
    secretKeyTag: z.string().trim(),
    secretValueCiphertext: z.string().trim(),
    secretValueIV: z.string().trim(),
    secretValueTag: z.string().trim(),
    secretCommentCiphertext: z.string().trim().optional(),
    secretCommentIV: z.string().trim().optional(),
    secretCommentTag: z.string().trim().optional(),
    metadata: z.record(z.string()).optional(),
    skipMultilineEncoding: z.boolean().optional()
  }),
  params: z.object({
    secretName: z.string().trim()
  })
});

export const UpdateSecretByNameV3 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretId: z.string().trim().optional(),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL]),
    secretPath: z.string().trim().default("/"),
    secretValueCiphertext: z.string().trim(),
    secretValueIV: z.string().trim(),
    secretValueTag: z.string().trim(),
    secretCommentCiphertext: z.string().trim().optional(),
    secretCommentIV: z.string().trim().optional(),
    secretCommentTag: z.string().trim().optional(),

    secretReminderRepeatDays: z.number().min(1).max(365).optional().nullable(),
    secretReminderNote: z.string().trim().nullable().optional(),

    tags: z.string().array().optional(),
    skipMultilineEncoding: z.boolean().optional(),
    // to update secret name
    secretName: z.string().trim().optional(),
    secretKeyIV: z.string().trim().optional(),
    secretKeyTag: z.string().trim().optional(),
    secretKeyCiphertext: z.string().trim().optional()
  }),
  params: z.object({
    secretName: z.string()
  })
});

export const DeleteSecretByNameV3 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    type: z.enum([SECRET_SHARED, SECRET_PERSONAL]),
    secretPath: z.string().trim().default("/"),
    secretId: z.string().trim().optional()
  }),
  params: z.object({
    secretName: z.string()
  })
});

export const CreateSecretByNameBatchV3 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    secrets: z
      .object({
        secretName: z.string().trim(),
        type: z.enum([SECRET_SHARED, SECRET_PERSONAL]),
        secretKeyCiphertext: z.string().trim(),
        secretKeyIV: z.string().trim(),
        secretKeyTag: z.string().trim(),
        secretValueCiphertext: z.string().trim(),
        secretValueIV: z.string().trim(),
        secretValueTag: z.string().trim(),
        secretCommentCiphertext: z.string().trim().optional(),
        secretCommentIV: z.string().trim().optional(),
        secretCommentTag: z.string().trim().optional(),
        metadata: z.record(z.string()).optional(),
        skipMultilineEncoding: z.boolean().optional()
      })
      .array()
      .min(1)
  })
});

export const UpdateSecretByNameBatchV3 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    secrets: z
      .object({
        secretName: z.string().trim(),
        type: z.enum([SECRET_SHARED, SECRET_PERSONAL]),
        secretValueCiphertext: z.string().trim(),
        secretValueIV: z.string().trim(),
        secretValueTag: z.string().trim(),
        secretCommentCiphertext: z.string().trim().optional(),
        secretCommentIV: z.string().trim().optional(),
        secretCommentTag: z.string().trim().optional(),
        skipMultilineEncoding: z.boolean().optional(),
        tags: z.string().array().optional()
      })
      .array()
      .min(1)
  })
});

export const DeleteSecretByNameBatchV3 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    environment: z.string().trim(),
    secretPath: z.string().trim().default("/"),
    secrets: z
      .object({
        secretName: z.string().trim(),
        type: z.enum([SECRET_SHARED, SECRET_PERSONAL])
      })
      .array()
      .min(1)
  })
});
