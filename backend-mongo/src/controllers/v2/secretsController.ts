import { Types } from "mongoose";
import { Request, Response } from "express";
import { Folder, ISecret, Secret, ServiceTokenData, Tag } from "../../models";
import { AuditLog, EventType, SecretVersion } from "../../ee/models";
import {
  ALGORITHM_AES_256_GCM,
  ENCODING_SCHEME_UTF8,
  K8_USER_AGENT_NAME,
  SECRET_PERSONAL
} from "../../variables";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import { EventService } from "../../services";
import { eventPushSecrets } from "../../events";
import { EEAuditLogService, EESecretService } from "../../ee/services";
import { SecretService, TelemetryService } from "../../services";
import { getUserAgentType } from "../../utils/posthog";
import { PERMISSION_WRITE_SECRETS } from "../../variables";
import {
  userHasNoAbility,
  userHasWorkspaceAccess,
  userHasWriteOnlyAbility
} from "../../ee/helpers/checkMembershipPermissions";
import _ from "lodash";
import {
  getFolderByPath,
  getFolderIdFromServiceToken,
  searchByFolderId,
  searchByFolderIdWithDir
} from "../../services/FolderService";
import { isValidScope } from "../../helpers/secrets";
import path from "path";
import { getAllImportedSecrets } from "../../services/SecretImportService";
import { validateRequest } from "../../helpers/validation";
import {
  BatchSecretsV2,
  GetSecretsV2,
  validateServiceTokenDataClientForWorkspace
} from "../../validation";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../ee/services/ProjectRoleService";
import { ForbiddenError, subject } from "@casl/ability";

/**
 * Peform a batch of any specified CUD secret operations
 * (used by dashboard)
 * @param req
 * @param res
 */
export const batchSecrets = async (req: Request, res: Response) => {
  const channel = getUserAgentType(req.headers["user-agent"]);
  const postHogClient = await TelemetryService.getPostHogClient();

  const validatedData = await validateRequest(BatchSecretsV2, req);
  const {
    body: { workspaceId, environment, requests }
  } = validatedData;
  let {
    body: { secretPath, folderId }
  } = validatedData;

  const secretIds = requests
    .filter(({ method }) => method !== "POST")
    // akhilmhdh: ts is dumb
    .map((el) => new Types.ObjectId((el.secret as any)._id));

  const oldSecrets = await Secret.find({
    _id: {
      $in: secretIds
    }
  });
  if (oldSecrets.length != secretIds.length) {
    throw BadRequestError({ message: "Failed to validate non-existent secrets" });
  }

  const createSecrets: any[] = [];
  const updateSecrets: any[] = [];
  const deleteSecrets: { _id: Types.ObjectId; secretName: string }[] = [];

  // get secret blind index salt
  const salt = await SecretService.getSecretBlindIndexSalt({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  if (secretPath !== "/") {
    folderId = await getFolderIdFromServiceToken(workspaceId, environment, secretPath);
  }

  if (folderId !== "root") {
    const folders = await Folder.findOne({ workspace: workspaceId, environment });
    if (!folders) throw BadRequestError({ message: "Folder not found" });

    const folder = searchByFolderIdWithDir(folders.nodes, folderId as string);
    if (!folder?.folder) throw BadRequestError({ message: "Folder not found" });

    secretPath = path.join(
      "/",
      ...folder.dir.map(({ name }) => name).filter((name) => name !== "root")
    );
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    await validateServiceTokenDataClientForWorkspace({
      serviceTokenData: req.authData.authPayload,
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      secretPath,
      requiredPermissions: [PERMISSION_WRITE_SECRETS]
    });
  }

  for await (const request of requests) {
    // do a validation

    let secretBlindIndex = "";
    switch (request.method) {
      case "POST":
        secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
          secretName: request.secret.secretName,
          salt
        });

        createSecrets.push({
          ...request.secret,
          version: 1,
          user: request.secret.type === SECRET_PERSONAL ? req.user : undefined,
          environment,
          workspace: workspaceId,
          folder: folderId,
          secretBlindIndex,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8
        });
        break;
      case "PATCH":
        secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
          secretName: request.secret.secretName,
          salt
        });

        updateSecrets.push({
          ...request.secret,
          _id: request.secret._id,
          secretBlindIndex,
          folder: folderId,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8
        });
        break;
      case "DELETE":
        deleteSecrets.push({
          _id: new Types.ObjectId(request.secret._id),
          secretName: request.secret.secretName
        });
        break;
    }
  }
  // not using service token  using auth
  if (!(req.authData.authPayload instanceof ServiceTokenData)) {
    const { permission } = await getAuthDataProjectPermissions({
      authData: req.authData,
      workspaceId: new Types.ObjectId(workspaceId)
    });

    if (createSecrets.length)
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );

    if (updateSecrets.length)
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );

    if (deleteSecrets.length)
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Delete,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
  }

  // handle create secrets
  let createdSecrets: ISecret[] = [];
  if (createSecrets.length > 0) {
    createdSecrets = (await Secret.insertMany(createSecrets)) as any;
    // (EE) add secret versions for new secrets
    await EESecretService.addSecretVersions({
      secretVersions: createdSecrets.map((n: any) => {
        return {
          ...n._doc,
          _id: new Types.ObjectId(),
          secret: n._id,
          isDeleted: false
        };
      })
    });

    const auditLogs = await Promise.all(
      createdSecrets.map((secret, index) => {
        return EEAuditLogService.createAuditLog(
          req.authData,
          {
            type: EventType.CREATE_SECRET,
            metadata: {
              environment: secret.environment,
              secretPath: secretPath ?? "/",
              secretId: secret._id.toString(),
              secretKey: createSecrets[index].secretName,
              secretVersion: secret.version
            }
          },
          {
            workspaceId: secret.workspace
          },
          false
        );
      })
    );

    await AuditLog.insertMany(auditLogs);

    if (postHogClient) {
      postHogClient.capture({
        event: "secrets added",
        distinctId: req.user.email,
        properties: {
          numberOfSecrets: createdSecrets.length,
          environment,
          workspaceId,
          folderId,
          channel,
          userAgent: req.headers?.["user-agent"]
        }
      });
    }
  }

  // handle update secrets
  let updatedSecrets: ISecret[] = [];
  if (updateSecrets.length > 0 && oldSecrets) {
    // construct object containing all secrets
    let listedSecretsObj: {
      [key: string]: {
        version: number;
        type: string;
      };
    } = {};

    listedSecretsObj = oldSecrets.reduce(
      (obj: any, secret: ISecret) => ({
        ...obj,
        [secret._id.toString()]: secret
      }),
      {}
    );

    const updateOperations = updateSecrets.map((u) => ({
      updateOne: {
        filter: {
          _id: new Types.ObjectId(u._id),
          workspace: new Types.ObjectId(workspaceId),
          environment
        },
        update: {
          $inc: {
            version: 1
          },
          $unset: {
            "metadata.source": true as const
          },
          ...u,
          _id: new Types.ObjectId(u._id)
        }
      }
    }));
    await Secret.bulkWrite(updateOperations);

    const secretVersions = updateSecrets.map(
      (u) =>
        new SecretVersion({
          secret: new Types.ObjectId(u._id),
          version: listedSecretsObj[u._id.toString()].version,
          workspace: new Types.ObjectId(workspaceId),
          type: listedSecretsObj[u._id.toString()].type,
          environment,
          isDeleted: false,
          secretBlindIndex: u.secretBlindIndex,
          secretKeyCiphertext: u.secretKeyCiphertext,
          secretKeyIV: u.secretKeyIV,
          secretKeyTag: u.secretKeyTag,
          secretValueCiphertext: u.secretValueCiphertext,
          secretValueIV: u.secretValueIV,
          secretValueTag: u.secretValueTag,
          secretCommentCiphertext: u.secretCommentCiphertext,
          secretCommentIV: u.secretCommentIV,
          secretCommentTag: u.secretCommentTag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8,
          tags: u.tags,
          folder: u.folder
        })
    );

    await EESecretService.addSecretVersions({
      secretVersions
    });

    updatedSecrets = await Secret.find({
      _id: {
        $in: updateSecrets.map((u) => new Types.ObjectId(u._id))
      }
    });

    const auditLogs = await Promise.all(
      updateSecrets.map((secret) => {
        return EEAuditLogService.createAuditLog(
          req.authData,
          {
            type: EventType.UPDATE_SECRET,
            metadata: {
              environment,
              secretPath: secretPath ?? "/",
              secretId: secret._id.toString(),
              secretKey: secret.secretName,
              secretVersion: listedSecretsObj[secret._id.toString()].version
            }
          },
          {
            workspaceId: new Types.ObjectId(workspaceId)
          },
          false
        );
      })
    );

    await AuditLog.insertMany(auditLogs);

    if (postHogClient) {
      postHogClient.capture({
        event: "secrets modified",
        distinctId: req.user.email,
        properties: {
          numberOfSecrets: updateSecrets.length,
          environment,
          workspaceId,
          folderId,
          channel,
          userAgent: req.headers?.["user-agent"]
        }
      });
    }
  }

  // handle delete secrets
  if (deleteSecrets.length > 0) {
    const deleteSecretIds: Types.ObjectId[] = deleteSecrets.map((s) => s._id);

    const deletedSecretsObj = (
      await Secret.find({
        _id: {
          $in: deleteSecretIds
        }
      })
    ).reduce(
      (obj: any, secret: ISecret) => ({
        ...obj,
        [secret._id.toString()]: secret
      }),
      {}
    );

    await Secret.deleteMany({
      _id: {
        $in: deleteSecretIds
      },
      workspace: new Types.ObjectId(workspaceId),
      environment
    });

    await EESecretService.markDeletedSecretVersions({
      secretIds: deleteSecretIds
    });

    const auditLogs = await Promise.all(
      deleteSecrets.map((secret) => {
        return EEAuditLogService.createAuditLog(
          req.authData,
          {
            type: EventType.DELETE_SECRET,
            metadata: {
              environment,
              secretPath: secretPath ?? "/",
              secretId: secret._id.toString(),
              secretKey: secret.secretName,
              secretVersion: deletedSecretsObj[secret._id.toString()].version
            }
          },
          {
            workspaceId: new Types.ObjectId(workspaceId)
          },
          false
        );
      })
    );

    await AuditLog.insertMany(auditLogs);

    if (postHogClient) {
      postHogClient.capture({
        event: "secrets deleted",
        distinctId: req.user.email,
        properties: {
          numberOfSecrets: deleteSecrets.length,
          environment,
          workspaceId,
          channel: channel,
          userAgent: req.headers?.["user-agent"]
        }
      });
    }
  }

  // // trigger event - push secrets
  await EventService.handleEvent({
    event: eventPushSecrets({
      workspaceId: new Types.ObjectId(workspaceId),
      environment,
      // root condition else this will be filled according to the path or folderid
      secretPath: secretPath || "/"
    })
  });

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId
  });

  const resObj: { [key: string]: ISecret[] | string[] } = {};

  if (createSecrets.length > 0) {
    resObj["createdSecrets"] = createdSecrets;
  }

  if (updateSecrets.length > 0) {
    resObj["updatedSecrets"] = updatedSecrets;
  }

  if (deleteSecrets.length > 0) {
    resObj["deletedSecrets"] = deleteSecrets.map((d) => d._id.toString());
  }

  return res.status(200).send(resObj);
};

/**
 * Create secret(s) for workspace with id [workspaceId] and environment [environment]
 * @param req
 * @param res
 */
export const createSecrets = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Create new secret(s)'
    #swagger.description = 'Create one or many secrets for a given project and environment.'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "workspaceId": {
                    "type": "string",
                    "description": "ID of project",
                },
                "environment": {
                    "type": "string",
                    "description": "Environment within project"
                },
                "secrets": {
                    $ref: "#/components/schemas/CreateSecret",
                    "description": "Secret(s) to create - object or array of objects"
                }
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Newly-created secrets for the given project and environment"
                        }
                    }
                }
            }           
        }
    }   
    */

  const channel = getUserAgentType(req.headers["user-agent"]);
  const {
    workspaceId,
    environment,
    secretPath
  }: {
    workspaceId: string;
    environment: string;
    secretPath?: string;
  } = req.body;
  let folderId = req.body.folderId;

  if (req.user) {
    const hasAccess = await userHasWorkspaceAccess(
      req.user,
      new Types.ObjectId(workspaceId),
      environment,
      PERMISSION_WRITE_SECRETS
    );
    if (!hasAccess) {
      throw UnauthorizedRequestError({
        message: "You do not have the necessary permission(s) perform this action"
      });
    }
  }

  let listOfSecretsToCreate;
  if (Array.isArray(req.body.secrets)) {
    // case: create multiple secrets
    listOfSecretsToCreate = req.body.secrets;
  } else if (typeof req.body.secrets === "object") {
    // case: create 1 secret
    listOfSecretsToCreate = [req.body.secrets];
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      environment,
      secretPath || "/"
    );

    // in service token when not giving secretpath folderid must be root
    // this is to avoid giving folderid when service tokens are used
    if ((!secretPath && folderId !== "root") || (secretPath && !isValidScopeAccess)) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }
  if (secretPath) {
    folderId = await getFolderIdFromServiceToken(workspaceId, environment, secretPath);
  }

  // get secret blind index salt
  const salt = await SecretService.getSecretBlindIndexSalt({
    workspaceId: new Types.ObjectId(workspaceId)
  });

  type secretsToCreateType = {
    type: string;
    secretName?: string;
    secretKeyCiphertext: string;
    secretKeyIV: string;
    secretKeyTag: string;
    secretValueCiphertext: string;
    secretValueIV: string;
    secretValueTag: string;
    secretCommentCiphertext: string;
    secretCommentIV: string;
    secretCommentTag: string;
    tags: string[];
  };

  const secretsToInsert: ISecret[] = await Promise.all(
    listOfSecretsToCreate.map(
      async ({
        type,
        secretName,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        tags
      }: secretsToCreateType) => {
        let secretBlindIndex;
        if (secretName) {
          secretBlindIndex = await SecretService.generateSecretBlindIndexWithSalt({
            secretName,
            salt
          });
        }

        return {
          version: 1,
          workspace: new Types.ObjectId(workspaceId),
          type,
          folderId,
          ...(secretBlindIndex ? { secretBlindIndex } : {}),
          user: req.user && type === SECRET_PERSONAL ? req.user : undefined,
          environment,
          secretKeyCiphertext,
          secretKeyIV,
          secretKeyTag,
          secretValueCiphertext,
          secretValueIV,
          secretValueTag,
          secretCommentCiphertext,
          secretCommentIV,
          secretCommentTag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8,
          tags
        };
      }
    )
  );

  const newlyCreatedSecrets: ISecret[] = (await Secret.insertMany(secretsToInsert)).map(
    (insertedSecret) => insertedSecret.toObject()
  );

  setTimeout(async () => {
    // trigger event - push secrets
    await EventService.handleEvent({
      event: eventPushSecrets({
        workspaceId: new Types.ObjectId(workspaceId),
        environment,
        secretPath: secretPath || "/"
      })
    });
  }, 5000);

  // (EE) add secret versions for new secrets
  await EESecretService.addSecretVersions({
    secretVersions: newlyCreatedSecrets.map(
      ({
        _id,
        version,
        workspace,
        type,
        user,
        environment,
        secretBlindIndex,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag
      }) =>
        new SecretVersion({
          secret: _id,
          version,
          workspace,
          type,
          user,
          environment,
          secretBlindIndex,
          isDeleted: false,
          secretKeyCiphertext,
          secretKeyIV,
          secretKeyTag,
          secretValueCiphertext,
          secretValueIV,
          secretValueTag,
          folder: folderId,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8
        })
    )
  });

  // (EE) take a secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId
  });

  const postHogClient = await TelemetryService.getPostHogClient();
  if (postHogClient) {
    postHogClient.capture({
      event: "secrets added",
      distinctId: await TelemetryService.getDistinctId({
        authData: req.authData
      }),
      properties: {
        numberOfSecrets: listOfSecretsToCreate.length,
        environment,
        workspaceId,
        channel: channel,
        folderId,
        userAgent: req.headers?.["user-agent"]
      }
    });
  }

  return res.status(200).send({
    secrets: newlyCreatedSecrets
  });
};

/**
 * Return secret(s) for workspace with id [workspaceId], environment [environment] and user
 * with id [req.user._id]
 * @param req
 * @param res
 * @returns
 */
export const getSecrets = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Read secrets'
    #swagger.description = 'Read secrets from a project and environment'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
        "description": "ID of project",
        "required": true,
        "type": "string"
    }

    #swagger.parameters['environment'] = {
        "description": "Environment within project",
        "required": true,
        "type": "string"
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Secrets for the given project and environment"
                        }
                    }
                }
            }           
        }
    }   
    */

  const validatedData = await validateRequest(GetSecretsV2, req);
  const {
    query: { tagSlugs, secretPath, include_imports, workspaceId, environment }
  } = validatedData;
  let {
    query: { folderId }
  } = validatedData;

  const folders = await Folder.findOne({ workspace: workspaceId, environment });

  if (
    // if no folders and asking for a non root folder id or non root secret path
    (!folders && folderId && folderId !== "root") ||
    (!folders && secretPath && secretPath !== "/")
  ) {
    res.send({ secrets: [] });
    return;
  }

  if (folders && folderId !== "root") {
    const folder = searchByFolderId(folders.nodes, folderId as string);
    if (!folder) {
      res.send({ secrets: [] });
      return;
    }
  }

  if (req.authData.authPayload instanceof ServiceTokenData) {
    const isValidScopeAccess = isValidScope(
      req.authData.authPayload,
      environment,
      (secretPath as string) || "/"
    );

    // in service token when not giving secretpath folderid must be root
    // this is to avoid giving folderid when service tokens are used
    if ((!secretPath && folderId !== "root") || (secretPath && !isValidScopeAccess)) {
      throw UnauthorizedRequestError({ message: "Folder Permission Denied" });
    }
  }

  if (folders && secretPath) {
    // avoid throwing error and send empty list
    const folder = getFolderByPath(folders.nodes, secretPath as string);
    if (!folder) {
      res.send({ secrets: [] });
      return;
    }
    folderId = folder.id;
  }

  // secrets to return
  let secrets: ISecret[] = [];

  // query tags table to get all tags ids for the tag names for the given workspace
  let tagIds = [];
  const tagNamesList = typeof tagSlugs === "string" && tagSlugs !== "" ? tagSlugs.split(",") : [];
  if (tagNamesList != undefined && tagNamesList.length != 0) {
    const workspaceFromDB = await Tag.find({ workspace: workspaceId });
    tagIds = _.map(tagNamesList, (tagName: string) => {
      const tag = _.find(workspaceFromDB, { slug: tagName });
      return tag ? tag.id : null;
    });
  }

  if (req.user) {
    // case: client authorization is via JWT
    const hasWriteOnlyAccess = await userHasWriteOnlyAbility(
      req.user._id,
      new Types.ObjectId(workspaceId),
      environment
    );
    const hasNoAccess = await userHasNoAbility(
      req.user._id,
      new Types.ObjectId(workspaceId),
      environment
    );
    if (hasNoAccess) {
      throw UnauthorizedRequestError({
        message: "You do not have the necessary permission(s) perform this action"
      });
    }

    const secretQuery: any = {
      workspace: workspaceId,
      environment,
      folder: folderId,
      $or: [
        { user: req.user._id }, // personal secrets for this user
        { user: { $exists: false } } // shared secrets from workspace
      ]
    };

    if (tagIds.length > 0) {
      secretQuery.tags = { $in: tagIds };
    }

    if (hasWriteOnlyAccess) {
      // only return the secret keys and not the values since user does not have right to see values
      secrets = await Secret.find(secretQuery)
        .select("secretKeyCiphertext secretKeyIV secretKeyTag")
        .populate("tags");
    } else {
      secrets = await Secret.find(secretQuery).populate("tags");
    }
  }

  // case: client authorization is via service token
  if (req.serviceTokenData) {
    const userId = req.serviceTokenData.user;

    const secretQuery: any = {
      workspace: workspaceId,
      folder: folderId,
      environment,
      $or: [
        { user: userId }, // personal secrets for this user
        { user: { $exists: false } } // shared secrets from workspace
      ]
    };

    if (tagIds.length > 0) {
      secretQuery.tags = { $in: tagIds };
    }

    // TODO check if service token has write only permission

    secrets = await Secret.find(secretQuery).populate("tags");
  }

  // TODO(akhilmhdh) - secret-imp change this to org type
  let importedSecrets: any[] = [];
  if (include_imports) {
    // depreciated
    importedSecrets = await getAllImportedSecrets(
      workspaceId,
      environment,
      folderId as string,
      () => false
    );
  }

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.GET_SECRETS,
      metadata: {
        environment,
        secretPath: (secretPath as string) ?? "/",
        numberOfSecrets: secrets.length
      }
    },
    {
      workspaceId: new Types.ObjectId(workspaceId as string)
    }
  );

  const postHogClient = await TelemetryService.getPostHogClient();

  // reduce the number of events captured
  let shouldRecordK8Event = false;
  if (req.authData.userAgent == K8_USER_AGENT_NAME) {
    const randomNumber = Math.random();
    if (randomNumber > 0.9) {
      shouldRecordK8Event = true;
    }
  }

  if (postHogClient) {
    const shouldCapture = req.authData.userAgent !== K8_USER_AGENT_NAME || shouldRecordK8Event;
    const approximateForNoneCapturedEvents = secrets.length * 10;

    if (shouldCapture) {
      postHogClient.capture({
        event: "secrets pulled",
        distinctId: await TelemetryService.getDistinctId({
          authData: req.authData
        }),
        properties: {
          numberOfSecrets: shouldRecordK8Event ? approximateForNoneCapturedEvents : secrets.length,
          environment,
          workspaceId,
          folderId,
          channel: req.authData.userAgentType,
          userAgent: req.authData.userAgent
        }
      });
    }
  }

  return res.status(200).send({
    secrets,
    ...(include_imports && { imports: importedSecrets })
  });
};

/**
 * Update secret(s)
 * @param req
 * @param res
 */
export const updateSecrets = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Update secret(s)'
    #swagger.description = 'Update secret(s)'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "secrets": {
                    $ref: "#/components/schemas/UpdateSecret",
                    "description": "Secret(s) to update - object or array of objects"
                }
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Updated secrets"
                        }
                    }
                }
            }           
        }
    }
    */
  const channel = req.headers?.["user-agent"]?.toLowerCase().includes("mozilla") ? "web" : "cli";

  interface PatchSecret {
    id: string;
    secretKeyCiphertext: string;
    secretKeyIV: string;
    secretKeyTag: string;
    secretValueCiphertext: string;
    secretValueIV: string;
    secretValueTag: string;
    secretCommentCiphertext: string;
    secretCommentIV: string;
    secretCommentTag: string;
    tags: string[];
  }

  const updateOperationsToPerform = req.body.secrets.map((secret: PatchSecret) => {
    const {
      secretKeyCiphertext,
      secretKeyIV,
      secretKeyTag,
      secretValueCiphertext,
      secretValueIV,
      secretValueTag,
      secretCommentCiphertext,
      secretCommentIV,
      secretCommentTag,
      tags
    } = secret;

    return {
      updateOne: {
        filter: { _id: new Types.ObjectId(secret.id) },
        update: {
          $inc: {
            version: 1
          },
          secretKeyCiphertext,
          secretKeyIV,
          secretKeyTag,
          secretValueCiphertext,
          secretValueIV,
          secretValueTag,
          algorithm: ALGORITHM_AES_256_GCM,
          keyEncoding: ENCODING_SCHEME_UTF8,
          tags,
          ...(secretCommentCiphertext !== undefined && secretCommentIV && secretCommentTag
            ? {
                secretCommentCiphertext,
                secretCommentIV,
                secretCommentTag
              }
            : {})
        }
      }
    };
  });

  await Secret.bulkWrite(updateOperationsToPerform);

  const secretModificationsBySecretId: { [key: string]: PatchSecret } = {};
  req.body.secrets.forEach((secret: PatchSecret) => {
    secretModificationsBySecretId[secret.id] = secret;
  });

  const ListOfSecretsBeforeModifications = req.secrets;
  const secretVersions = {
    secretVersions: ListOfSecretsBeforeModifications.map((secret: ISecret) => {
      const {
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext,
        secretCommentIV,
        secretCommentTag,
        tags
      } = secretModificationsBySecretId[secret._id.toString()];

      return {
        secret: secret._id,
        version: secret.version + 1,
        workspace: secret.workspace,
        type: secret.type,
        environment: secret.environment,
        secretKeyCiphertext: secretKeyCiphertext ? secretKeyCiphertext : secret.secretKeyCiphertext,
        secretKeyIV: secretKeyIV ? secretKeyIV : secret.secretKeyIV,
        secretKeyTag: secretKeyTag ? secretKeyTag : secret.secretKeyTag,
        secretValueCiphertext: secretValueCiphertext
          ? secretValueCiphertext
          : secret.secretValueCiphertext,
        secretValueIV: secretValueIV ? secretValueIV : secret.secretValueIV,
        secretValueTag: secretValueTag ? secretValueTag : secret.secretValueTag,
        secretCommentCiphertext: secretCommentCiphertext
          ? secretCommentCiphertext
          : secret.secretCommentCiphertext,
        secretCommentIV: secretCommentIV ? secretCommentIV : secret.secretCommentIV,
        secretCommentTag: secretCommentTag ? secretCommentTag : secret.secretCommentTag,
        tags: tags ? tags : secret.tags,
        algorithm: ALGORITHM_AES_256_GCM,
        keyEncoding: ENCODING_SCHEME_UTF8
      };
    })
  };

  await EESecretService.addSecretVersions(secretVersions);

  // group secrets into workspaces so updated secrets can
  // be logged and snapshotted separately for each workspace
  const workspaceSecretObj: any = {};
  req.secrets.forEach((s: any) => {
    if (s.workspace.toString() in workspaceSecretObj) {
      workspaceSecretObj[s.workspace.toString()].push(s);
    } else {
      workspaceSecretObj[s.workspace.toString()] = [s];
    }
  });

  Object.keys(workspaceSecretObj).forEach(async (key) => {
    // trigger event - push secrets
    // This route is not used anymore thus keep it commented out as it does not expose environment
    // it will end up creating a lot of requests from the server
    // setTimeout(async () => {
    //   await EventService.handleEvent({
    //     event: eventPushSecrets({
    //       workspaceId: new Types.ObjectId(key),
    //       environment,
    //     })
    //   });
    // }, 10000);

    // (EE) take a secret snapshot
    // IMP(akhilmhdh): commented out due to unknown where the environment is
    // await EESecretService.takeSecretSnapshot({
    //   workspaceId: new Types.ObjectId(key),
    //   environment,
    //   folderId,
    // });

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "secrets modified",
        distinctId: await TelemetryService.getDistinctId({
          authData: req.authData
        }),
        properties: {
          numberOfSecrets: workspaceSecretObj[key].length,
          environment: workspaceSecretObj[key][0].environment,
          workspaceId: key,
          channel: channel,
          userAgent: req.headers?.["user-agent"]
        }
      });
    }
  });

  return res.status(200).send({
    secrets: await Secret.find({
      _id: {
        $in: req.secrets.map((secret: ISecret) => secret._id)
      }
    })
  });
};

/**
 * Delete secret(s)
 * @param req
 * @param res
 */
export const deleteSecrets = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Delete secret(s)'
    #swagger.description = 'Delete one or many secrets by their ID(s)'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

    #swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "secretIds": {
                    "type": "string",
                    "description": "ID(s) of secrets - string or array of strings"
                },
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                "schema": { 
                    "type": "object",
                    "properties": {
                        "secrets": {
                            "type": "array",
                            "items": {
                                $ref: "#/components/schemas/Secret" 
                            },
                            "description": "Deleted secrets"
                        }
                    }
                }
            }           
        }
    }   
    */

  const channel = getUserAgentType(req.headers["user-agent"]);
  const toDelete = req.secrets.map((s: any) => s._id);

  await Secret.deleteMany({
    _id: {
      $in: toDelete
    }
  });

  await EESecretService.markDeletedSecretVersions({
    secretIds: toDelete
  });

  // group secrets into workspaces so deleted secrets can
  // be logged and snapshotted separately for each workspace
  const workspaceSecretObj: any = {};
  req.secrets.forEach((s: any) => {
    if (s.workspace.toString() in workspaceSecretObj) {
      workspaceSecretObj[s.workspace.toString()].push(s);
    } else {
      workspaceSecretObj[s.workspace.toString()] = [s];
    }
  });

  Object.keys(workspaceSecretObj).forEach(async (key) => {
    // trigger event - push secrets
    // DEPRECIATED(akhilmhdh): as this would cause server to send so many request
    // and this route is not used anymore thus like snapshot keeping it commented out
    // await EventService.handleEvent({
    //   event: eventPushSecrets({
    //     workspaceId: new Types.ObjectId(key)
    //   })
    // });

    // (EE) take a secret snapshot
    // IMP(akhilmhdh): Not sure how to take secretSnapshot
    // await EESecretService.takeSecretSnapshot({
    //   workspaceId: new Types.ObjectId(key),
    // });

    const postHogClient = await TelemetryService.getPostHogClient();
    if (postHogClient) {
      postHogClient.capture({
        event: "secrets deleted",
        distinctId: await TelemetryService.getDistinctId({
          authData: req.authData
        }),
        properties: {
          numberOfSecrets: workspaceSecretObj[key].length,
          environment: workspaceSecretObj[key][0].environment,
          workspaceId: key,
          channel: channel,
          userAgent: req.headers?.["user-agent"]
        }
      });
    }
  });

  return res.status(200).send({
    secrets: req.secrets
  });
};
