import {
  CreateUserCommand,
  DeleteUserCommand,
  DescribeClustersCommand,
  MemoryDB,
  UpdateACLCommand
} from "@aws-sdk/client-memorydb";
import handlebars from "handlebars";
import { customAlphabet } from "nanoid";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { AwsMemoryDbAuthType, DynamicSecretAwsMemoryDbSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

const CreateMemoryDbUserSchema = z.object({
  UserName: z.string().trim().min(1),
  AccessString: z.string().trim().min(1),
  AuthenticationMode: z.object({
    Type: z.literal("password"),
    Passwords: z.array(z.string().trim().min(1)).min(1).max(1)
  })
});

const DeleteMemoryDbUserSchema = z.object({
  UserName: z.string().trim().min(1)
});

type TMemoryDbUser = { userName: string; password: string };
type TBasicAWSCredentials = { accessKeyId: string; secretAccessKey: string };

type TCreateMemoryDbUserInput = z.infer<typeof CreateMemoryDbUserSchema>;
type TDeleteMemoryDbUserInput = z.infer<typeof DeleteMemoryDbUserSchema>;

const MemoryDbUserManager = (credentials: TBasicAWSCredentials, region: string) => {
  const memorydb = new MemoryDB({
    region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials
  });

  const getClusterAcl = async (clusterName: string): Promise<string> => {
    const cluster = (
      await memorydb.send(
        new DescribeClustersCommand({
          ClusterName: clusterName
        })
      )
    ).Clusters?.[0];

    if (!cluster) {
      throw new BadRequestError({ message: `MemoryDB cluster ${clusterName} not found` });
    }
    if (!cluster.ACLName || cluster.ACLName === "open-access") {
      throw new BadRequestError({
        message: `MemoryDB cluster ${clusterName} has no ACL attached. Attach an ACL to the cluster before using it for dynamic secrets.`
      });
    }
    return cluster.ACLName;
  };

  const $addUserToAcl = async (aclName: string, userName: string) => {
    await memorydb.send(
      new UpdateACLCommand({
        ACLName: aclName,
        UserNamesToAdd: [userName],
        UserNamesToRemove: []
      })
    );
  };

  const createUser = async (creationInput: TCreateMemoryDbUserInput, clusterName: string) => {
    const aclName = await getClusterAcl(clusterName);

    await memorydb.send(new CreateUserCommand(creationInput));
    await $addUserToAcl(aclName, creationInput.UserName);

    return {
      userName: creationInput.UserName,
      password: creationInput.AuthenticationMode.Passwords[0]
    };
  };

  const deleteUser = async (deletionInput: TDeleteMemoryDbUserInput): Promise<Pick<TMemoryDbUser, "userName">> => {
    await memorydb.send(new DeleteUserCommand(deletionInput));
    return { userName: deletionInput.UserName };
  };

  const verifyCredentials = async (clusterName: string) => {
    await memorydb.send(
      new DescribeClustersCommand({
        ClusterName: clusterName
      })
    );
  };

  return {
    createUser,
    deleteUser,
    verifyCredentials
  };
};

const generatePassword = () => {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.~!*";
  return customAlphabet(charset, 64)();
};

const $getAwsCredentials = (providerInputs: z.infer<typeof DynamicSecretAwsMemoryDbSchema>): TBasicAWSCredentials => {
  if (providerInputs.auth.type === AwsMemoryDbAuthType.IAM) {
    return {
      accessKeyId: providerInputs.auth.accessKeyId,
      secretAccessKey: providerInputs.auth.secretAccessKey
    };
  }
  throw new BadRequestError({ message: "Unsupported MemoryDB auth type" });
};

export const AwsMemoryDbDatabaseProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = DynamicSecretAwsMemoryDbSchema.parse(inputs);

    CreateMemoryDbUserSchema.parse(JSON.parse(providerInputs.creationStatement));
    DeleteMemoryDbUserSchema.parse(JSON.parse(providerInputs.revocationStatement));
    validateHandlebarTemplate("AWS MemoryDB creation", providerInputs.creationStatement, {
      allowedExpressions: (val) => ["username", "password", "expiration"].includes(val)
    });
    if (providerInputs.revocationStatement) {
      validateHandlebarTemplate("AWS MemoryDB revoke", providerInputs.revocationStatement, {
        allowedExpressions: (val) => ["username"].includes(val)
      });
    }

    return providerInputs;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const credentials = $getAwsCredentials(providerInputs);
    try {
      await MemoryDbUserManager(credentials, providerInputs.region).verifyCredentials(providerInputs.clusterName);
      return true;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [
          credentials.accessKeyId,
          credentials.secretAccessKey,
          providerInputs.clusterName,
          providerInputs.region
        ]
      });
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, expireAt, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs);
    await validateConnection(providerInputs);

    const credentials = $getAwsCredentials(providerInputs);

    const leaseUsername = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,
      usernameCharset: "abcdefghijklmnopqrstuvwxyz0123456789-",
      usernameLowercase: true,
      usernamePrefix: "inf-"
    });
    const leasePassword = generatePassword();
    const leaseExpiration = new Date(expireAt).toISOString();

    const creationStatement = handlebars.compile(providerInputs.creationStatement, { noEscape: true })({
      username: leaseUsername,
      password: leasePassword,
      expiration: leaseExpiration
    });

    const parsedStatement = CreateMemoryDbUserSchema.parse(JSON.parse(creationStatement));

    try {
      await MemoryDbUserManager(credentials, providerInputs.region).createUser(
        parsedStatement,
        providerInputs.clusterName
      );

      return {
        entityId: leaseUsername,
        data: {
          DB_USERNAME: leaseUsername,
          DB_PASSWORD: leasePassword
        }
      };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [
          leaseUsername,
          leasePassword,
          credentials.accessKeyId,
          credentials.secretAccessKey,
          providerInputs.clusterName
        ]
      });
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const credentials = $getAwsCredentials(providerInputs);

    const revokeStatement = handlebars.compile(providerInputs.revocationStatement, { noEscape: true })({
      username: entityId
    });
    const parsedStatement = DeleteMemoryDbUserSchema.parse(JSON.parse(revokeStatement));

    try {
      await MemoryDbUserManager(credentials, providerInputs.region).deleteUser(parsedStatement);

      return { entityId };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [entityId, credentials.accessKeyId, credentials.secretAccessKey, providerInputs.clusterName]
      });
      throw new BadRequestError({
        message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    return { entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
