import { Types } from "mongoose";
import { ISecret, Secret } from "../models";
import { EESecretService } from "../ee/services";
import { SecretVersion } from "../ee/models";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_UTF8,
  SECRET_PERSONAL,
  SECRET_SHARED,
} from "../variables";

interface V1PushSecret {
  ciphertextKey: string;
  ivKey: string;
  tagKey: string;
  hashKey: string;
  ciphertextValue: string;
  ivValue: string;
  tagValue: string;
  hashValue: string;
  ciphertextComment: string;
  ivComment: string;
  tagComment: string;
  hashComment: string;
  type: "shared" | "personal";
}

interface V2PushSecret {
  type: string; // personal or shared
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretKeyHash: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretValueHash: string;
  secretCommentCiphertext?: string;
  secretCommentIV?: string;
  secretCommentTag?: string;
  secretCommentHash?: string;
}

interface Update {
  [index: string]: any;
}

/**
 * Push secrets for user with id [userId] to workspace
 * with id [workspaceId] with environment [environment]. Follow steps:
 * 1. Handle shared secrets (insert, delete)
 * 2. handle personal secrets (insert, delete)
 * @param {Object} obj
 * @param {String} obj.userId - id of user to push secrets for
 * @param {String} obj.workspaceId - id of workspace to push to
 * @param {String} obj.environment - environment for secrets
 * @param {Object[]} obj.secrets - secrets to push
 */
export const v1PushSecrets = async ({
  userId,
  workspaceId,
  environment,
  secrets,
}: {
  userId: string;
  workspaceId: string;
  environment: string;
  secrets: V1PushSecret[];
}): Promise<void> => {
  // TODO: clean up function and fix up types
  // construct useful data structures
  const oldSecrets = await getSecrets({
    userId,
    workspaceId,
    environment,
  });

  const oldSecretsObj: any = oldSecrets.reduce(
    (accumulator, s: any) => ({
      ...accumulator,
      [`${s.type}-${s.secretKeyHash}`]: s,
    }),
    {}
  );
  const newSecretsObj: any = secrets.reduce(
    (accumulator, s) => ({ ...accumulator, [`${s.type}-${s.hashKey}`]: s }),
    {}
  );

  // handle deleting secrets
  const toDelete = oldSecrets
    .filter((s: ISecret) => !(`${s.type}-${s.secretKeyHash}` in newSecretsObj))
    .map((s) => s._id);
  if (toDelete.length > 0) {
    await Secret.deleteMany({
      _id: { $in: toDelete },
    });

    await EESecretService.markDeletedSecretVersions({
      secretIds: toDelete,
    });
  }

  const toUpdate = oldSecrets.filter((s) => {
    if (`${s.type}-${s.secretKeyHash}` in newSecretsObj) {
      if (
        s.secretValueHash !==
        newSecretsObj[`${s.type}-${s.secretKeyHash}`].hashValue ||
        s.secretCommentHash !==
        newSecretsObj[`${s.type}-${s.secretKeyHash}`].hashComment
      ) {
        // case: filter secrets where value or comment changed
        return true;
      }

      if (!s.version) {
        // case: filter (legacy) secrets that were not versioned
        return true;
      }
    }

    return false;
  });

  const operations = toUpdate.map((s) => {
    const {
      ciphertextValue,
      ivValue,
      tagValue,
      hashValue,
      ciphertextComment,
      ivComment,
      tagComment,
      hashComment,
    } = newSecretsObj[`${s.type}-${s.secretKeyHash}`];

    const update: Update = {
      secretValueCiphertext: ciphertextValue,
      secretValueIV: ivValue,
      secretValueTag: tagValue,
      secretValueHash: hashValue,
      secretCommentCiphertext: ciphertextComment,
      secretCommentIV: ivComment,
      secretCommentTag: tagComment,
      secretCommentHash: hashComment,
    };

    if (!s.version) {
      // case: (legacy) secret was not versioned
      update.version = 1;
    } else {
      update["$inc"] = {
        version: 1,
      };
    }

    if (s.type === SECRET_PERSONAL) {
      // attach user associated with the personal secret
      update["user"] = userId;
    }

    return {
      updateOne: {
        filter: {
          _id: oldSecretsObj[`${s.type}-${s.secretKeyHash}`]._id,
        },
        update,
      },
    };
  });
  await Secret.bulkWrite(operations as any);

  // (EE) add secret versions for updated secrets
  await EESecretService.addSecretVersions({
    secretVersions: toUpdate.map(({ _id, version, type, secretKeyHash }) => {
      const newSecret = newSecretsObj[`${type}-${secretKeyHash}`];
      return new SecretVersion({
        secret: _id,
        version: version ? version + 1 : 1,
        workspace: new Types.ObjectId(workspaceId),
        type: newSecret.type,
        user: new Types.ObjectId(userId),
        environment,
        isDeleted: false,
        secretKeyCiphertext: newSecret.ciphertextKey,
        secretKeyIV: newSecret.ivKey,
        secretKeyTag: newSecret.tagKey,
        secretKeyHash: newSecret.hashKey,
        secretValueCiphertext: newSecret.ciphertextValue,
        secretValueIV: newSecret.ivValue,
        secretValueTag: newSecret.tagValue,
        secretValueHash: newSecret.hashValue,
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8,
      });
    }),
  });

  // handle adding new secrets
  const toAdd = secrets.filter(
    (s) => !(`${s.type}-${s.hashKey}` in oldSecretsObj)
  );

  if (toAdd.length > 0) {
    // add secrets
    const newSecrets: ISecret[] = (
      await Secret.insertMany(
        toAdd.map((s, idx) => {
          const obj: any = {
            version: 1,
            workspace: workspaceId,
            type: toAdd[idx].type,
            environment,
            secretKeyCiphertext: s.ciphertextKey,
            secretKeyIV: s.ivKey,
            secretKeyTag: s.tagKey,
            secretKeyHash: s.hashKey,
            secretValueCiphertext: s.ciphertextValue,
            secretValueIV: s.ivValue,
            secretValueTag: s.tagValue,
            secretValueHash: s.hashValue,
            secretCommentCiphertext: s.ciphertextComment,
            secretCommentIV: s.ivComment,
            secretCommentTag: s.tagComment,
            secretCommentHash: s.hashComment,
            algorithm: ALGORITHM_AES_256_GCM,
            keyEncoding: ENCODING_SCHEME_UTF8,
          };

          if (toAdd[idx].type === "personal") {
            obj["user" as keyof typeof obj] = userId;
          }

          return obj;
        })
      )
    ).map((insertedSecret) => insertedSecret.toObject());

    // (EE) add secret versions for new secrets
    EESecretService.addSecretVersions({
      secretVersions: newSecrets.map(
        ({
          _id,
          version,
          workspace,
          type,
          user,
          environment,
          secretKeyCiphertext,
          secretKeyIV,
          secretKeyTag,
          secretKeyHash,
          secretValueCiphertext,
          secretValueIV,
          secretValueTag,
          secretValueHash,
          algorithm,
          keyEncoding,
        }) =>
          new SecretVersion({
            secret: _id,
            version,
            workspace,
            type,
            user,
            environment,
            isDeleted: false,
            secretKeyCiphertext,
            secretKeyIV,
            secretKeyTag,
            secretKeyHash,
            secretValueCiphertext,
            secretValueIV,
            secretValueTag,
            secretValueHash,
            algorithm,
            keyEncoding,
          })
      ),
    });
  }

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
  });
};

/**
 * Push secrets for user with id [userId] to workspace
 * with id [workspaceId] with environment [environment]. Follow steps:
 * 1. Handle shared secrets (insert, delete)
 * 2. handle personal secrets (insert, delete)
 * @param {Object} obj
 * @param {String} obj.userId - id of user to push secrets for
 * @param {String} obj.workspaceId - id of workspace to push to
 * @param {String} obj.environment - environment for secrets
 * @param {Object[]} obj.secrets - secrets to push
 * @param {String} obj.channel - channel (web/cli/auto)
 * @param {String} obj.ipAddress - ip address of request to push secrets
 */
export const v2PushSecrets = async ({
  userId,
  workspaceId,
  environment,
  secrets,
  channel,
  ipAddress,
}: {
  userId: string;
  workspaceId: string;
  environment: string;
  secrets: V2PushSecret[];
  channel: string;
  ipAddress: string;
}): Promise<void> => {
  // TODO: clean up function and fix up types

  // construct useful data structures
  const oldSecrets = await getSecrets({
    userId,
    workspaceId,
    environment,
  });

  const oldSecretsObj: any = oldSecrets.reduce(
    (accumulator, s: any) => ({
      ...accumulator,
      [`${s.type}-${s.secretKeyHash}`]: s,
    }),
    {}
  );
  const newSecretsObj: any = secrets.reduce(
    (accumulator, s) => ({
      ...accumulator,
      [`${s.type}-${s.secretKeyHash}`]: s,
    }),
    {}
  );

  // handle deleting secrets
  const toDelete = oldSecrets
    .filter((s: ISecret) => !(`${s.type}-${s.secretKeyHash}` in newSecretsObj))
    .map((s) => s._id);
  if (toDelete.length > 0) {
    await Secret.deleteMany({
      _id: { $in: toDelete },
    });

    await EESecretService.markDeletedSecretVersions({
      secretIds: toDelete,
    });
  }

  const toUpdate = oldSecrets.filter((s) => {
    if (`${s.type}-${s.secretKeyHash}` in newSecretsObj) {
      if (
        s.secretValueHash !==
        newSecretsObj[`${s.type}-${s.secretKeyHash}`].secretValueHash ||
        s.secretCommentHash !==
        newSecretsObj[`${s.type}-${s.secretKeyHash}`].secretCommentHash
      ) {
        // case: filter secrets where value or comment changed
        return true;
      }

      if (!s.version) {
        // case: filter (legacy) secrets that were not versioned
        return true;
      }
    }

    return false;
  });

  if (toUpdate.length > 0) {
    const operations = toUpdate.map((s) => {
      const {
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretValueHash,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        secretCommentHash,
      } = newSecretsObj[`${s.type}-${s.secretKeyHash}`];

      const update: Update = {
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretValueHash,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        secretCommentHash,
      };

      if (!s.version) {
        // case: (legacy) secret was not versioned
        update.version = 1;
      } else {
        update["$inc"] = {
          version: 1,
        };
      }

      if (s.type === SECRET_PERSONAL) {
        // attach user associated with the personal secret
        update["user"] = userId;
      }

      return {
        updateOne: {
          filter: {
            _id: oldSecretsObj[`${s.type}-${s.secretKeyHash}`]._id,
          },
          update,
        },
      };
    });
    await Secret.bulkWrite(operations as any);

    // (EE) add secret versions for updated secrets
    await EESecretService.addSecretVersions({
      secretVersions: toUpdate.map((s) => {
        return {
          ...newSecretsObj[`${s.type}-${s.secretKeyHash}`],
          secret: s._id,
          version: s.version ? s.version + 1 : 1,
          workspace: new Types.ObjectId(workspaceId),
          user: s.user,
          environment: s.environment,
          isDeleted: false,
        };
      }),
    });
  }

  // handle adding new secrets
  const toAdd = secrets.filter(
    (s) => !(`${s.type}-${s.secretKeyHash}` in oldSecretsObj)
  );

  if (toAdd.length > 0) {
    // add secrets
    const newSecrets = await Secret.insertMany(
      toAdd.map((s, idx) => ({
        ...s,
        version: 1,
        workspace: workspaceId,
        type: toAdd[idx].type,
        environment,
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8,
        ...(toAdd[idx].type === "personal" ? { user: userId } : {}),
      }))
    );

    // (EE) add secret versions for new secrets
    EESecretService.addSecretVersions({
      secretVersions: newSecrets.map((secretDocument) => {
        return new SecretVersion({
          ...secretDocument,
          secret: secretDocument._id,
          isDeleted: false,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8,
        });
      }),
    });
  }

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
  });
};

/**
 * Get secrets for user with id [userId] for workspace
 * with id [workspaceId] with environment [environment]
 * @param {Object} obj
 * @param {String} obj.userId -id of user to pull secrets for
 * @param {String} obj.workspaceId - id of workspace to pull from
 * @param {String} obj.environment - environment for secrets
 */
export const getSecrets = async ({
  userId,
  workspaceId,
  environment,
}: {
  userId: string;
  workspaceId: string;
  environment: string;
}): Promise<ISecret[]> => {
  // get shared workspace secrets
  const sharedSecrets = await Secret.find({
    workspace: workspaceId,
    environment,
    type: SECRET_SHARED,
  });

  // get personal workspace secrets
  const personalSecrets = await Secret.find({
    workspace: workspaceId,
    environment,
    type: SECRET_PERSONAL,
    user: userId,
  });

  // concat shared and personal workspace secrets
  const secrets = personalSecrets.concat(sharedSecrets);

  return secrets;
};

/**
 * Pull secrets for user with id [userId] for workspace
 * with id [workspaceId] with environment [environment]
 * @param {Object} obj
 * @param {String} obj.userId -id of user to pull secrets for
 * @param {String} obj.workspaceId - id of workspace to pull from
 * @param {String} obj.environment - environment for secrets
 * @param {String} obj.channel - channel (web/cli/auto)
 * @param {String} obj.ipAddress - ip address of request to push secrets
 */
export const pullSecrets = async ({
  userId,
  workspaceId,
  environment,
  channel,
  ipAddress,
}: {
  userId: string;
  workspaceId: string;
  environment: string;
  channel: string;
  ipAddress: string;
}): Promise<ISecret[]> => {
  const secrets = await getSecrets({
    userId,
    workspaceId,
    environment,
  });

  return secrets;
};

/**
 * Reformat output of pullSecrets() to be compatible with how existing
 * web client handle secrets
 * @param {Object} obj
 * @param {Object} obj.secrets
 */
export const reformatPullSecrets = ({ secrets }: { secrets: ISecret[] }) => {
  const reformatedSecrets = secrets.map((s) => ({
    _id: s._id,
    workspace: s.workspace,
    type: s.type,
    environment: s.environment,
    secretKey: {
      workspace: s.workspace,
      ciphertext: s.secretKeyCiphertext,
      iv: s.secretKeyIV,
      tag: s.secretKeyTag,
      hash: s.secretKeyHash,
    },
    secretValue: {
      workspace: s.workspace,
      ciphertext: s.secretValueCiphertext,
      iv: s.secretValueIV,
      tag: s.secretValueTag,
      hash: s.secretValueHash,
    },
    secretComment: {
      workspace: s.workspace,
      ciphertext: s.secretCommentCiphertext,
      iv: s.secretCommentIV,
      tag: s.secretCommentTag,
      hash: s.secretCommentHash,
    },
  }));

  return reformatedSecrets;
};