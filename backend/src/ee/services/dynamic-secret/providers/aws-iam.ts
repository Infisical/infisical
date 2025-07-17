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
import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { z } from "zod";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { AwsIamAuthType, DynamicSecretAwsIamSchema, TDynamicProviderFns } from "./models";
import { compileUsernameTemplate } from "./templateUtils";

const generateUsername = (usernameTemplate?: string | null, identity?: { name: string }) => {
  const randomUsername = alphaNumericNanoId(32);
  if (!usernameTemplate) return randomUsername;

  return compileUsernameTemplate({
    usernameTemplate,
    randomUsername,
    identity
  });
};

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
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity?: {
      name: string;
    };
    metadata: { projectId: string };
  }) => {
    const { inputs, usernameTemplate, metadata, identity } = data;

    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs, metadata.projectId);

    const username = generateUsername(usernameTemplate, identity);
    const { policyArns, userGroups, policyDocument, awsPath, permissionBoundaryPolicyArn } = providerInputs;
    const awsTags = [{ Key: "createdBy", Value: "infisical-dynamic-secret" }];

    if (providerInputs.tags && Array.isArray(providerInputs.tags)) {
      const additionalTags = providerInputs.tags.map((tag) => ({
        Key: tag.key,
        Value: tag.value
      }));
      awsTags.push(...additionalTags);
    }

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
            client.send(new AttachUserPolicyCommand({ UserName: createUserRes?.User?.UserName, PolicyArn: policyArn }))
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
  };

  const revoke = async (inputs: unknown, entityId: string, metadata: { projectId: string }) => {
    const providerInputs = await validateProviderInputs(inputs);
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

    await client.send(new DeleteUserCommand({ UserName: username }));
    return { entityId: username };
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
