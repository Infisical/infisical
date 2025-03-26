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
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretAwsIamSchema, TDynamicProviderFns } from "./models";

const generateUsername = () => {
  return alphaNumericNanoId(32);
};

export const AwsIamProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretAwsIamSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $getClient = async (providerInputs: z.infer<typeof DynamicSecretAwsIamSchema>) => {
    const client = new IAMClient({
      region: providerInputs.region,
      credentials: {
        accessKeyId: providerInputs.accessKey,
        secretAccessKey: providerInputs.secretAccessKey
      }
    });

    return client;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const isConnected = await client.send(new GetUserCommand({})).then(() => true);
    return isConnected;
  };

  const create = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

    const username = generateUsername();
    const { policyArns, userGroups, policyDocument, awsPath, permissionBoundaryPolicyArn } = providerInputs;
    const createUserRes = await client.send(
      new CreateUserCommand({
        Path: awsPath,
        PermissionsBoundary: permissionBoundaryPolicyArn || undefined,
        Tags: [{ Key: "createdBy", Value: "infisical-dynamic-secret" }],
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

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const client = await $getClient(providerInputs);

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
