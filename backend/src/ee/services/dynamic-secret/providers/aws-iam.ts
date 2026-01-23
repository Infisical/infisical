import {
  AddUserToGroupCommand,
  AttachUserPolicyCommand,
  CreateAccessKeyCommand,
  CreateUserCommand,
  DeleteAccessKeyCommand,
  DeleteUserCommand,
  DeleteUserPolicyCommand,
  DetachUserPolicyCommand,
  GetUserCommand,
  IAMClient,
  ListAccessKeysCommand,
  ListAttachedUserPoliciesCommand,
  ListGroupsForUserCommand,
  ListUserPoliciesCommand,
  PutUserPolicyCommand,
  RemoveUserFromGroupCommand
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand, GetSessionTokenCommand, STSClient } from "@aws-sdk/client-sts";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { AwsIamAuthType, AwsIamCredentialType, DynamicSecretAwsIamSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

// AWS STS duration constants (in seconds)
const AWS_STS_MIN_DURATION = 900;

export const AwsIamProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretAwsIamSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretAwsIamSchema>, projectId: string) => {
    const appCfg = getConfig();
    if (providerInputs.method === AwsIamAuthType.AssumeRole) {
      const stsClient = new STSClient({
        region: providerInputs.region,
        useFipsEndpoint: crypto.isFipsModeEnabled(),
        sha256: CustomAWSHasher,
        credentials:
          appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID && appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID,
                secretAccessKey: appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
              }
            : undefined // if hosting on AWS
      });

      const command = new AssumeRoleCommand({
        RoleArn: providerInputs.roleArn,
        RoleSessionName: `infisical-dynamic-secret-${crypto.nativeCrypto.randomUUID()}`,
        DurationSeconds: 900, // 15 mins
        ExternalId: projectId
      });

      const assumeRes = await stsClient.send(command);

      if (!assumeRes.Credentials?.AccessKeyId || !assumeRes.Credentials?.SecretAccessKey) {
        throw new BadRequestError({ message: "Failed to assume role - verify credentials and role configuration" });
      }
      const client = new IAMClient({
        region: providerInputs.region,
        useFipsEndpoint: crypto.isFipsModeEnabled(),
        sha256: CustomAWSHasher,
        credentials: {
          accessKeyId: assumeRes.Credentials?.AccessKeyId,
          secretAccessKey: assumeRes.Credentials?.SecretAccessKey,
          sessionToken: assumeRes.Credentials?.SessionToken
        }
      });
      return client;
    }

    if (providerInputs.method === AwsIamAuthType.IRSA) {
      // Allow instances to disable automatic service account token fetching (e.g. for shared cloud)
      if (!appCfg.KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN) {
        throw new UnauthorizedError({
          message: "Failed to get AWS credentials via IRSA: KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN is not enabled."
        });
      }

      // The SDK will automatically pick up credentials from the environment
      const client = new IAMClient({
        region: providerInputs.region,
        useFipsEndpoint: crypto.isFipsModeEnabled(),
        sha256: CustomAWSHasher
      });
      return client;
    }

    const client = new IAMClient({
      region: providerInputs.region,
      useFipsEndpoint: crypto.isFipsModeEnabled(),
      sha256: CustomAWSHasher,
      credentials: {
        accessKeyId: providerInputs.accessKey,
        secretAccessKey: providerInputs.secretAccessKey
      }
    });

    return client;
  };

  const validateConnection = async (inputs: unknown, { projectId }: { projectId: string }) => {
    const providerInputs = await validateProviderInputs(inputs);
    try {
      if (providerInputs.credentialType === AwsIamCredentialType.TemporaryCredentials) {
        if (providerInputs.method === AwsIamAuthType.AccessKey) {
          const stsClient = new STSClient({
            region: providerInputs.region,
            useFipsEndpoint: crypto.isFipsModeEnabled(),
            sha256: CustomAWSHasher,
            credentials: {
              accessKeyId: providerInputs.accessKey,
              secretAccessKey: providerInputs.secretAccessKey
            }
          });

          await stsClient.send(new GetSessionTokenCommand({ DurationSeconds: AWS_STS_MIN_DURATION }));
          return true;
        }
        if (providerInputs.method === AwsIamAuthType.AssumeRole) {
          const appCfg = getConfig();
          const stsClient = new STSClient({
            region: providerInputs.region,
            useFipsEndpoint: crypto.isFipsModeEnabled(),
            sha256: CustomAWSHasher,
            credentials:
              appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID && appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID,
                    secretAccessKey: appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
                  }
                : undefined
          });

          await stsClient.send(
            new AssumeRoleCommand({
              RoleArn: providerInputs.roleArn,
              RoleSessionName: `infisical-validation-${crypto.nativeCrypto.randomUUID()}`,
              DurationSeconds: AWS_STS_MIN_DURATION,
              ExternalId: projectId
            })
          );
          return true;
        }
        if (providerInputs.method === AwsIamAuthType.IRSA) {
          const stsClient = new STSClient({
            region: providerInputs.region,
            useFipsEndpoint: crypto.isFipsModeEnabled(),
            sha256: CustomAWSHasher
          });

          await stsClient.send(new GetSessionTokenCommand({ DurationSeconds: AWS_STS_MIN_DURATION }));
          return true;
        }
      }

      const client = await $getClient(providerInputs, projectId);
      const isConnected = await client
        .send(new GetUserCommand({}))
        .then(() => true)
        .catch((err) => {
          const message = (err as Error)?.message;
          if (
            (providerInputs.method === AwsIamAuthType.AssumeRole || providerInputs.method === AwsIamAuthType.IRSA) &&
            // assume role will throw an error asking to provider username, but if so this has access in aws correctly
            message.includes("Must specify userName when calling with non-User credentials")
          ) {
            return true;
          }
          throw err;
        });
      return isConnected;
    } catch (err) {
      const sensitiveTokens: string[] = [];
      if (providerInputs.method === AwsIamAuthType.AccessKey) {
        sensitiveTokens.push(providerInputs.accessKey, providerInputs.secretAccessKey);
      }
      if (providerInputs.method === AwsIamAuthType.AssumeRole) {
        sensitiveTokens.push(providerInputs.roleArn);
      }
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: sensitiveTokens
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
    metadata: { projectId: string };
  }) => {
    const { inputs, usernameTemplate, metadata, identity, expireAt, dynamicSecret } = data;

    const providerInputs = await validateProviderInputs(inputs);

    if (providerInputs.credentialType === AwsIamCredentialType.TemporaryCredentials) {
      try {
        let stsClient: STSClient;
        let entityId: string;

        const currentTime = Date.now();
        const requestedDuration = Math.floor((expireAt - currentTime) / 1000);

        if (requestedDuration <= 0) {
          throw new BadRequestError({ message: "Expiration time must be in the future" });
        }

        let durationSeconds: number;

        if (providerInputs.method === AwsIamAuthType.AssumeRole) {
          durationSeconds = requestedDuration;
          const appCfg = getConfig();
          stsClient = new STSClient({
            region: providerInputs.region,
            useFipsEndpoint: crypto.isFipsModeEnabled(),
            sha256: CustomAWSHasher,
            credentials:
              appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID && appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: appCfg.DYNAMIC_SECRET_AWS_ACCESS_KEY_ID,
                    secretAccessKey: appCfg.DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY
                  }
                : undefined
          });

          const assumeRoleRes = await stsClient.send(
            new AssumeRoleCommand({
              RoleArn: providerInputs.roleArn,
              RoleSessionName: `infisical-temp-cred-${crypto.nativeCrypto.randomUUID()}`,
              DurationSeconds: durationSeconds,
              ExternalId: metadata.projectId
            })
          );

          if (
            !assumeRoleRes.Credentials?.AccessKeyId ||
            !assumeRoleRes.Credentials?.SecretAccessKey ||
            !assumeRoleRes.Credentials?.SessionToken
          ) {
            throw new BadRequestError({ message: "Failed to assume role - verify credentials and role configuration" });
          }

          entityId = `assume-role-${alphaNumericNanoId(8)}`;
          return {
            entityId,
            data: {
              ACCESS_KEY: assumeRoleRes.Credentials.AccessKeyId,
              SECRET_ACCESS_KEY: assumeRoleRes.Credentials.SecretAccessKey,
              SESSION_TOKEN: assumeRoleRes.Credentials.SessionToken
            }
          };
        }
        if (providerInputs.method === AwsIamAuthType.AccessKey) {
          durationSeconds = requestedDuration;
          stsClient = new STSClient({
            region: providerInputs.region,
            useFipsEndpoint: crypto.isFipsModeEnabled(),
            sha256: CustomAWSHasher,
            credentials: {
              accessKeyId: providerInputs.accessKey,
              secretAccessKey: providerInputs.secretAccessKey
            }
          });

          const sessionTokenRes = await stsClient.send(
            new GetSessionTokenCommand({
              DurationSeconds: durationSeconds
            })
          );

          if (
            !sessionTokenRes.Credentials?.AccessKeyId ||
            !sessionTokenRes.Credentials?.SecretAccessKey ||
            !sessionTokenRes.Credentials?.SessionToken
          ) {
            throw new BadRequestError({ message: "Failed to get session token - verify credentials and permissions" });
          }

          entityId = `session-token-${alphaNumericNanoId(8)}`;
          return {
            entityId,
            data: {
              ACCESS_KEY: sessionTokenRes.Credentials.AccessKeyId,
              SECRET_ACCESS_KEY: sessionTokenRes.Credentials.SecretAccessKey,
              SESSION_TOKEN: sessionTokenRes.Credentials.SessionToken
            }
          };
        }
        if (providerInputs.method === AwsIamAuthType.IRSA) {
          durationSeconds = requestedDuration;
          stsClient = new STSClient({
            region: providerInputs.region,
            useFipsEndpoint: crypto.isFipsModeEnabled(),
            sha256: CustomAWSHasher
          });

          const sessionTokenRes = await stsClient.send(
            new GetSessionTokenCommand({
              DurationSeconds: durationSeconds
            })
          );

          if (
            !sessionTokenRes.Credentials?.AccessKeyId ||
            !sessionTokenRes.Credentials?.SecretAccessKey ||
            !sessionTokenRes.Credentials?.SessionToken
          ) {
            throw new BadRequestError({
              message: "Failed to get session token - verify IRSA credentials and permissions"
            });
          }

          entityId = `irsa-session-${alphaNumericNanoId(8)}`;
          return {
            entityId,
            data: {
              ACCESS_KEY: sessionTokenRes.Credentials.AccessKeyId,
              SECRET_ACCESS_KEY: sessionTokenRes.Credentials.SecretAccessKey,
              SESSION_TOKEN: sessionTokenRes.Credentials.SessionToken
            }
          };
        }

        throw new BadRequestError({ message: "Unsupported authentication method for temporary credentials" });
      } catch (err) {
        const sensitiveTokens: string[] = [];
        if (providerInputs.method === AwsIamAuthType.AccessKey) {
          sensitiveTokens.push(providerInputs.accessKey, providerInputs.secretAccessKey);
        }
        if (providerInputs.method === AwsIamAuthType.AssumeRole) {
          sensitiveTokens.push(providerInputs.roleArn);
        }

        let errorMessage = (err as Error)?.message || "Unknown error";

        if (err && typeof err === "object" && "name" in err && "$metadata" in err) {
          const awsError = err as { name?: string; message?: string; $metadata?: object };
          if (awsError.name) {
            errorMessage = `${awsError.name}: ${errorMessage}`;
          }
        }

        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: errorMessage,
          tokens: sensitiveTokens
        });
        throw new BadRequestError({
          message: `Failed to create temporary credentials: ${sanitizedErrorMessage}`
        });
      }
    }

    if (providerInputs.credentialType === AwsIamCredentialType.IamUser) {
      const client = await $getClient(providerInputs, metadata.projectId);

      const username = await generateUsername(usernameTemplate, {
        decryptedDynamicSecretInputs: inputs,
        dynamicSecret,
        identity
      });
      const { policyArns, userGroups, policyDocument, awsPath, permissionBoundaryPolicyArn } = providerInputs;
      const awsTags = [{ Key: "createdBy", Value: "infisical-dynamic-secret" }];

      if (providerInputs.tags && Array.isArray(providerInputs.tags)) {
        const additionalTags = providerInputs.tags.map((tag) => ({
          Key: tag.key,
          Value: tag.value
        }));
        awsTags.push(...additionalTags);
      }

      try {
        const createUserRes = await client.send(
          new CreateUserCommand({
            Path: awsPath,
            PermissionsBoundary: permissionBoundaryPolicyArn || undefined,
            Tags: awsTags,
            UserName: username
          })
        );

        if (!createUserRes.User) throw new BadRequestError({ message: "Failed to create AWS IAM User" });
        if (userGroups) {
          await Promise.all(
            userGroups
              .split(",")
              .filter(Boolean)
              .map((group) =>
                client.send(new AddUserToGroupCommand({ UserName: createUserRes?.User?.UserName, GroupName: group }))
              )
          );
        }
        if (policyArns) {
          await Promise.all(
            policyArns
              .split(",")
              .filter(Boolean)
              .map((policyArn) =>
                client.send(
                  new AttachUserPolicyCommand({ UserName: createUserRes?.User?.UserName, PolicyArn: policyArn })
                )
              )
          );
        }
        if (policyDocument) {
          await client.send(
            new PutUserPolicyCommand({
              UserName: createUserRes.User.UserName,
              PolicyName: `infisical-dynamic-policy-${alphaNumericNanoId(4)}`,
              PolicyDocument: policyDocument
            })
          );
        }

        const createAccessKeyRes = await client.send(
          new CreateAccessKeyCommand({
            UserName: createUserRes.User.UserName
          })
        );
        if (!createAccessKeyRes.AccessKey)
          throw new BadRequestError({ message: "Failed to create AWS IAM User access key" });

        return {
          entityId: username,
          data: {
            ACCESS_KEY: createAccessKeyRes.AccessKey.AccessKeyId,
            SECRET_ACCESS_KEY: createAccessKeyRes.AccessKey.SecretAccessKey,
            USERNAME: username
          }
        };
      } catch (err) {
        const sensitiveTokens = [username];
        if (providerInputs.method === AwsIamAuthType.AccessKey) {
          sensitiveTokens.push(providerInputs.accessKey, providerInputs.secretAccessKey);
        }
        if (providerInputs.method === AwsIamAuthType.AssumeRole) {
          sensitiveTokens.push(providerInputs.roleArn);
        }
        const sanitizedErrorMessage = sanitizeString({
          unsanitizedString: (err as Error)?.message,
          tokens: sensitiveTokens
        });
        throw new BadRequestError({
          message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
        });
      }
    }

    throw new BadRequestError({ message: "Invalid credential type specified" });
  };

  const revoke = async (inputs: unknown, entityId: string, metadata: { projectId: string }) => {
    const providerInputs = await validateProviderInputs(inputs);

    if (providerInputs.credentialType === AwsIamCredentialType.TemporaryCredentials) {
      return { entityId };
    }

    const client = await $getClient(providerInputs, metadata.projectId);

    const username = entityId;

    // remove user from groups
    const userGroups = await client.send(new ListGroupsForUserCommand({ UserName: username }));
    await Promise.all(
      (userGroups.Groups || []).map(({ GroupName }) =>
        client.send(
          new RemoveUserFromGroupCommand({
            GroupName,
            UserName: username
          })
        )
      )
    );

    // remove user access keys
    const userAccessKeys = await client.send(new ListAccessKeysCommand({ UserName: username }));
    await Promise.all(
      (userAccessKeys.AccessKeyMetadata || []).map(({ AccessKeyId }) =>
        client.send(
          new DeleteAccessKeyCommand({
            AccessKeyId,
            UserName: username
          })
        )
      )
    );

    // remove user inline policies
    const userInlinePolicies = await client.send(new ListUserPoliciesCommand({ UserName: username }));
    await Promise.all(
      (userInlinePolicies.PolicyNames || []).map((policyName) =>
        client.send(
          new DeleteUserPolicyCommand({
            PolicyName: policyName,
            UserName: username
          })
        )
      )
    );

    // remove user attached  policies
    const userAttachedPolicies = await client.send(new ListAttachedUserPoliciesCommand({ UserName: username }));
    await Promise.all(
      (userAttachedPolicies.AttachedPolicies || []).map((policy) =>
        client.send(
          new DetachUserPolicyCommand({
            PolicyArn: policy.PolicyArn,
            UserName: username
          })
        )
      )
    );

    try {
      await client.send(new DeleteUserCommand({ UserName: username }));
      return { entityId: username };
    } catch (err) {
      const sensitiveTokens = [username];
      if (providerInputs.method === AwsIamAuthType.AccessKey) {
        sensitiveTokens.push(providerInputs.accessKey, providerInputs.secretAccessKey);
      }
      if (providerInputs.method === AwsIamAuthType.AssumeRole) {
        sensitiveTokens.push(providerInputs.roleArn);
      }
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: sensitiveTokens
      });
      throw new BadRequestError({
        message: `Failed to revoke lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    // No renewal necessary
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
