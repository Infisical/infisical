import { Request, Response } from "express";
import { PipelineStage, Types } from "mongoose";
import {
  Folder,
  Membership,
  Secret,
  ServiceTokenData,
  ServiceTokenDataV3,
  TFolderSchema,
  User,
  Workspace
} from "../../../models";
import {
  ActorType,
  AuditLog,
  EventType,
  FolderVersion,
  IPType,
  ISecretVersion,
  SecretSnapshot,
  SecretVersion,
  ServiceActor,
  ServiceActorV3,
  TFolderRootVersionSchema,
  TrustedIP,
  UserActor
} from "../../models";
import { EESecretService } from "../../services";
import { getLatestSecretVersionIds } from "../../helpers/secretVersion";
import { getFolderByPath, searchByFolderId } from "../../../services/FolderService";
import { EEAuditLogService, EELicenseService } from "../../services";
import { extractIPDetails, isValidIpOrCidr } from "../../../utils/ip";
import { validateRequest } from "../../../helpers/validation";
import {
  AddWorkspaceTrustedIpV1,
  DeleteWorkspaceTrustedIpV1,
  GetWorkspaceAuditLogActorFilterOptsV1,
  GetWorkspaceAuditLogsV1,
  GetWorkspaceSecretSnapshotsCountV1,
  GetWorkspaceSecretSnapshotsV1,
  GetWorkspaceTrustedIpsV1,
  RollbackWorkspaceSecretSnapshotV1,
  UpdateWorkspaceTrustedIpV1
} from "../../../validation";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  getAuthDataProjectPermissions
} from "../../services/ProjectRoleService";
import { ForbiddenError } from "@casl/ability";
import { BadRequestError } from "../../../utils/errors";

/**
 * Return secret snapshots for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const getWorkspaceSecretSnapshots = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return project secret snapshot ids'
    #swagger.description = 'Return project secret snapshots ids'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['offset'] = {
		"description": "Number of secret snapshots to skip",
		"required": false,
		"type": "string"
	}

	#swagger.parameters['limit'] = {
		"description": "Maximum number of secret snapshots to return",
		"required": false,
		"type": "string"
	}

	#swagger.responses[200] = {
        content: {
            "application/json": {
                schema: { 
					"type": "object",
					"properties": {
						"secretSnapshots": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/SecretSnapshot" 
							},
							"description": "Project secret snapshots"
						}
					}
                }
            }           
        }
    }
    */
  const {
    params: { workspaceId },
    query: { environment, directory, offset, limit }
  } = await validateRequest(GetWorkspaceSecretSnapshotsV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRollback
  );

  let folderId = "root";
  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders && directory !== "/") throw BadRequestError({ message: "Folder not found" });

  if (folders) {
    const folder = getFolderByPath(folders?.nodes, directory);
    if (!folder) throw BadRequestError({ message: "Invalid folder id" });
    folderId = folder.id;
  }

  const secretSnapshots = await SecretSnapshot.find({
    workspace: workspaceId,
    environment,
    folderId
  })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);

  return res.status(200).send({
    secretSnapshots
  });
};

/**
 * Return count of secret snapshots for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const getWorkspaceSecretSnapshotsCount = async (req: Request, res: Response) => {
  const {
    params: { workspaceId },
    query: { environment, directory }
  } = await validateRequest(GetWorkspaceSecretSnapshotsCountV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.SecretRollback
  );

  let folderId = "root";
  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders && directory !== "/") throw BadRequestError({ message: "Folder not found" });

  if (folders) {
    const folder = getFolderByPath(folders?.nodes, directory);
    if (!folder) throw BadRequestError({ message: "Invalid folder id" });
    folderId = folder.id;
  }

  const count = await SecretSnapshot.countDocuments({
    workspace: workspaceId,
    environment,
    folderId
  });

  return res.status(200).send({
    count
  });
};

/**
 * Rollback secret snapshot with id [secretSnapshotId] to version [version]
 * @param req
 * @param res
 * @returns
 */
export const rollbackWorkspaceSecretSnapshot = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Roll back project secrets to those captured in a secret snapshot version.'
    #swagger.description = 'Roll back project secrets to those captured in a secret snapshot version.'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	} 

	#swagger.requestBody = {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
                "version": {
                    "type": "integer",
                    "description": "Version of secret snapshot to roll back to",
                }
            }
          }
        }
      }
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                schema: { 
                    "type": "object",
					"properties": {
						"secrets": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/Secret" 
							},
							"description": "Secrets rolled back to"
						}
					}
                }
            }           
        }
    }   
    */

  const {
    params: { workspaceId },
    body: { directory, environment, version }
  } = await validateRequest(RollbackWorkspaceSecretSnapshotV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.SecretRollback
  );

  let folderId = "root";
  const folders = await Folder.findOne({ workspace: workspaceId, environment });
  if (!folders && directory !== "/") throw BadRequestError({ message: "Folder not found" });

  if (folders) {
    const folder = getFolderByPath(folders?.nodes, directory);
    if (!folder) throw BadRequestError({ message: "Invalid folder id" });
    folderId = folder.id;
  }

  // validate secret snapshot
  const secretSnapshot = await SecretSnapshot.findOne({
    workspace: workspaceId,
    version,
    environment,
    folderId: folderId
  })
    .populate<{ secretVersions: ISecretVersion[] }>({
      path: "secretVersions",
      select: "+secretBlindIndex"
    })
    .populate<{ folderVersion: TFolderRootVersionSchema }>("folderVersion");

  if (!secretSnapshot) throw new Error("Failed to find secret snapshot");

  const snapshotFolderTree = secretSnapshot.folderVersion;
  const latestFolderTree = await Folder.findOne({
    workspace: workspaceId,
    environment
  });

  const latestFolderVersion = await FolderVersion.findOne({
    environment,
    workspace: workspaceId,
    "nodes.id": folderId
  }).sort({ "nodes.version": -1 });

  const oldSecretVersionsObj: Record<string, ISecretVersion> = {};
  const secretIds: Types.ObjectId[] = [];
  const folderIds: string[] = [folderId];

  secretSnapshot.secretVersions.forEach((snapSecVer) => {
    oldSecretVersionsObj[snapSecVer.secret.toString()] = snapSecVer;
    secretIds.push(snapSecVer.secret);
  });

  // the parent node from current latest one
  // this will be modified according to the snapshot and latest snapshots
  const newFolderTree = latestFolderTree && searchByFolderId(latestFolderTree.nodes, folderId);

  if (newFolderTree) {
    newFolderTree.children = snapshotFolderTree?.nodes?.children || [];
    const queue = [newFolderTree];
    // a bfs algorithm in which we take the latest snapshots of all the folders in a level
    while (queue.length) {
      const groupByFolderId: Record<string, TFolderSchema> = {};
      // the original queue is popped out completely to get what ever in a level
      // subqueue is filled with all the children thus next level folders
      // subQueue will then be transfered to the oriinal queue
      const subQueue: TFolderSchema[] = [];
      // get everything inside a level
      while (queue.length) {
        const folder = queue.pop() as TFolderSchema;
        folder.children.forEach((el) => {
          folderIds.push(el.id); // push ids and data into queu
          subQueue.push(el);
          // to modify the original tree very fast we keep a reference object
          // key with folder id and pointing to the various nodes
          groupByFolderId[el.id] = el;
        });
      }
      // get latest snapshots of all the folder
      const matchWsFoldersPipeline = {
        $match: {
          workspace: new Types.ObjectId(workspaceId),
          environment,
          folderId: {
            $in: Object.keys(groupByFolderId)
          }
        }
      };
      const sortByFolderIdAndVersion: PipelineStage = {
        $sort: { folderId: 1, version: -1 }
      };
      const pickLatestVersionOfEachFolder = {
        $group: {
          _id: "$folderId",
          latestVersion: { $first: "$version" },
          doc: {
            $first: "$$ROOT"
          }
        }
      };
      const populateSecVersion = {
        $lookup: {
          from: SecretVersion.collection.name,
          localField: "doc.secretVersions",
          foreignField: "_id",
          as: "doc.secretVersions"
        }
      };
      const populateFolderVersion = {
        $lookup: {
          from: FolderVersion.collection.name,
          localField: "doc.folderVersion",
          foreignField: "_id",
          as: "doc.folderVersion"
        }
      };
      const unwindFolderVerField = {
        $unwind: {
          path: "$doc.folderVersion",
          preserveNullAndEmptyArrays: true
        }
      };
      const latestSnapshotsByFolders: Array<{ doc: typeof secretSnapshot }> =
        await SecretSnapshot.aggregate([
          matchWsFoldersPipeline,
          sortByFolderIdAndVersion,
          pickLatestVersionOfEachFolder,
          populateSecVersion,
          populateFolderVersion,
          unwindFolderVerField
        ]);

      // recursive snapshotting each level
      latestSnapshotsByFolders.forEach((snap) => {
        // mutate the folder tree to update the nodes to the latest version tree
        // we are reconstructing the folder tree by latest snapshots here
        if (groupByFolderId[snap.doc.folderId]) {
          groupByFolderId[snap.doc.folderId].children =
            snap.doc?.folderVersion?.nodes?.children || [];
        }

        // push all children of next level snapshots
        if (snap.doc.folderVersion?.nodes?.children) {
          queue.push(...snap.doc.folderVersion.nodes.children);
        }

        snap.doc.secretVersions.forEach((snapSecVer) => {
          // record all the secrets
          oldSecretVersionsObj[snapSecVer.secret.toString()] = snapSecVer;
          secretIds.push(snapSecVer.secret);
        });
      });

      queue.push(...subQueue);
    }
  }

  // TODO: fix any
  const latestSecretVersionIds = await getLatestSecretVersionIds({
    secretIds
  });

  // TODO: fix any
  const latestSecretVersions: any = (
    await SecretVersion.find(
      {
        _id: {
          $in: latestSecretVersionIds.map((s) => s.versionId)
        }
      },
      "secret version"
    )
  ).reduce(
    (accumulator, s) => ({
      ...accumulator,
      [`${s.secret.toString()}`]: s
    }),
    {}
  );

  const secDelQuery: Record<string, unknown> = {
    workspace: workspaceId,
    environment
    // undefined means root thus collect all secrets
  };
  if (folderId !== "root" && folderIds.length) secDelQuery.folder = { $in: folderIds };

  // delete existing secrets
  await Secret.deleteMany(secDelQuery);
  await Folder.deleteOne({
    workspace: workspaceId,
    environment
  });

  // add secrets
  const secrets = await Secret.insertMany(
    Object.keys(oldSecretVersionsObj).map((sv) => {
      const {
        secret: secretId,
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
        secretValueTag,
        createdAt,
        algorithm,
        keyEncoding,
        folder: secFolderId
      } = oldSecretVersionsObj[sv];

      return {
        _id: secretId,
        version: latestSecretVersions[secretId.toString()].version + 1,
        workspace,
        type,
        user,
        environment,
        secretBlindIndex: secretBlindIndex ?? undefined,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        secretCommentCiphertext: "",
        secretCommentIV: "",
        secretCommentTag: "",
        createdAt,
        algorithm,
        keyEncoding,
        folder: secFolderId
      };
    })
  );

  // add secret versions
  const secretV = await SecretVersion.insertMany(
    secrets.map(
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
        secretValueTag,
        algorithm,
        keyEncoding,
        folder: secFolderId
      }) => ({
        _id: new Types.ObjectId(),
        secret: _id,
        version,
        workspace,
        type,
        user,
        environment,
        isDeleted: false,
        secretBlindIndex: secretBlindIndex ?? undefined,
        secretKeyCiphertext,
        secretKeyIV,
        secretKeyTag,
        secretValueCiphertext,
        secretValueIV,
        secretValueTag,
        algorithm,
        keyEncoding,
        folder: secFolderId
      })
    )
  );

  if (newFolderTree && latestFolderTree) {
    // save the updated folder tree to the present one
    newFolderTree.version = (latestFolderVersion?.nodes?.version || 0) + 1;
    latestFolderTree._id = new Types.ObjectId();
    latestFolderTree.isNew = true;
    await latestFolderTree.save();

    // create new folder version
    const newFolderVersion = new FolderVersion({
      workspace: workspaceId,
      environment,
      nodes: newFolderTree
    });
    await newFolderVersion.save();
  }

  // update secret versions of restored secrets as not deleted
  await SecretVersion.updateMany(
    {
      secret: {
        $in: Object.keys(oldSecretVersionsObj).map((sv) => oldSecretVersionsObj[sv].secret)
      }
    },
    {
      isDeleted: false
    }
  );

  // take secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId
  });

  return res.status(200).send({
    secrets
  });
};

/**
 * Return audit logs for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const getWorkspaceAuditLogs = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return audit logs'
    #swagger.description = 'Return audit logs'
    
    #swagger.security = [{
      "apiKeyAuth": []
    }]

    #swagger.parameters['workspaceId'] = {
      "description": "ID of the workspace where to get folders from",
      "required": true,
      "type": "string",
      "in": "path"
    }

    #swagger.parameters['offset'] = {
      "description": "Number of logs to skip before starting to return logs for pagination",
      "required": false,
      "type": "string"
    }

    #swagger.parameters['limit'] = {
      "description": "Maximum number of logs to return for pagination",
      "required": false,
      "type": "string"
    }

   #swagger.parameters['startDate'] = {
      "description": "Filter logs from this date in ISO-8601 format",
      "required": false,
      "type": "string"
    }

   #swagger.parameters['endDate'] = {
      "description": "Filter logs till this date in ISO-8601 format",
      "required": false,
      "type": "string"
    }

    #swagger.parameters['eventType'] = {
      "description": "Filter by type of event such as get-secrets, get-secret, create-secret, update-secret, delete-secret, etc.",
      "required": false,
      "type": "string",
    }

    #swagger.parameters['userAgentType'] = {
      "description": "Filter by type of user agent such as web, cli, k8-operator, or other",
      "required": false,
      "type": "string",
    }

    #swagger.parameters['actor'] = {
      "description": "Filter by actor such as user or service",
      "required": false,
      "type": "string"
    }

    #swagger.responses[200] = {
        content: {
            "application/json": {
                schema: { 
                  "type": "object",
                  "properties": {
                        "auditLogs": {
                            "type": "array",
                            "items": {
			      $ref: "#/components/schemas/AuditLog",
                            },
                            "description": "List of audit log"                        
                          },
                  }
                }
            }           
        }
    }   
    */
  const {
    query: { limit, offset, endDate, eventType, startDate, userAgentType, actor },
    params: { workspaceId }
  } = await validateRequest(GetWorkspaceAuditLogsV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.AuditLogs
  );

  const query = {
    workspace: new Types.ObjectId(workspaceId),
    ...(eventType
      ? {
          "event.type": eventType
        }
      : {}),
    ...(userAgentType
      ? {
          userAgentType
        }
      : {}),
    ...(actor
      ? {
          "actor.type": actor.substring(0, actor.lastIndexOf("-")),
          ...(actor.split("-", 2)[0] === ActorType.USER
            ? {
                "actor.metadata.userId": actor.substring(actor.lastIndexOf("-") + 1)
              }
            : {
                "actor.metadata.serviceId": actor.substring(actor.lastIndexOf("-") + 1)
              })
        }
      : {}),
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate && { $gte: new Date(startDate) }),
            ...(endDate && { $lte: new Date(endDate) })
          }
        }
      : {})
  };
  const auditLogs = await AuditLog.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit);
  return res.status(200).send({
    auditLogs
  });
};

/**
 * Return audit log actor filter options for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const getWorkspaceAuditLogActorFilterOpts = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(GetWorkspaceAuditLogActorFilterOptsV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.AuditLogs
  );

  const userIds = await Membership.distinct("user", {
    workspace: new Types.ObjectId(workspaceId)
  });
  const userActors: UserActor[] = (
    await User.find({
      _id: {
        $in: userIds
      }
    }).select("email")
  ).map((user) => ({
    type: ActorType.USER,
    metadata: {
      userId: user._id.toString(),
      email: user.email
    }
  }));

  const serviceActors: ServiceActor[] = (
    await ServiceTokenData.find({
      workspace: new Types.ObjectId(workspaceId)
    }).select("name")
  ).map((serviceTokenData) => ({
    type: ActorType.SERVICE,
    metadata: {
      serviceId: serviceTokenData._id.toString(),
      name: serviceTokenData.name
    }
  }));

  const serviceV3Actors: ServiceActorV3[] = (
    await ServiceTokenDataV3.find({
      workspace: new Types.ObjectId(workspaceId)
    })
  ).map((serviceTokenData) => ({
    type: ActorType.SERVICE_V3,
    metadata: {
      serviceId: serviceTokenData._id.toString(),
      name: serviceTokenData.name
    }
  }));

  const actors = [...userActors, ...serviceActors, ...serviceV3Actors];

  return res.status(200).send({
    actors
  });
};

/**
 * Return trusted ips for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const getWorkspaceTrustedIps = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(GetWorkspaceTrustedIpsV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.IpAllowList
  );

  const trustedIps = await TrustedIP.find({
    workspace: new Types.ObjectId(workspaceId)
  });

  return res.status(200).send({
    trustedIps
  });
};

/**
 * Add a trusted ip to workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const addWorkspaceTrustedIp = async (req: Request, res: Response) => {
  const {
    params: { workspaceId },
    body: { comment, isActive, ipAddress: ip }
  } = await validateRequest(AddWorkspaceTrustedIpV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Create,
    ProjectPermissionSub.IpAllowList
  );

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw BadRequestError({ message: "Workspace not found" });

  const plan = await EELicenseService.getPlan(workspace.organization);

  if (!plan.ipAllowlisting)
    return res.status(400).send({
      message:
        "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
    });

  const isValidIPOrCidr = isValidIpOrCidr(ip);

  if (!isValidIPOrCidr)
    return res.status(400).send({
      message: "The IP is not a valid IPv4, IPv6, or CIDR block"
    });

  const { ipAddress, type, prefix } = extractIPDetails(ip);

  const trustedIp = await new TrustedIP({
    workspace: new Types.ObjectId(workspaceId),
    ipAddress,
    type,
    prefix,
    isActive,
    comment
  }).save();

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.ADD_TRUSTED_IP,
      metadata: {
        trustedIpId: trustedIp._id.toString(),
        ipAddress: trustedIp.ipAddress,
        prefix: trustedIp.prefix
      }
    },
    {
      workspaceId: trustedIp.workspace
    }
  );

  return res.status(200).send({
    trustedIp
  });
};

/**
 * Update trusted ip with id [trustedIpId] workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const updateWorkspaceTrustedIp = async (req: Request, res: Response) => {
  const {
    params: { workspaceId, trustedIpId },
    body: { ipAddress: ip, comment }
  } = await validateRequest(UpdateWorkspaceTrustedIpV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.IpAllowList
  );

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw BadRequestError({ message: "Workspace not found" });

  const plan = await EELicenseService.getPlan(workspace.organization);

  if (!plan.ipAllowlisting)
    return res.status(400).send({
      message:
        "Failed to update IP access range due to plan restriction. Upgrade plan to update IP access range."
    });

  const isValidIPOrCidr = isValidIpOrCidr(ip);

  if (!isValidIPOrCidr)
    return res.status(400).send({
      message: "The IP is not a valid IPv4, IPv6, or CIDR block"
    });

  const { ipAddress, type, prefix } = extractIPDetails(ip);

  const updateObject: {
    ipAddress: string;
    type: IPType;
    comment: string;
    prefix?: number;
    $unset?: {
      prefix: number;
    };
  } = {
    ipAddress,
    type,
    comment
  };

  if (prefix !== undefined) {
    updateObject.prefix = prefix;
  } else {
    updateObject.$unset = { prefix: 1 };
  }

  const trustedIp = await TrustedIP.findOneAndUpdate(
    {
      _id: new Types.ObjectId(trustedIpId),
      workspace: new Types.ObjectId(workspaceId)
    },
    updateObject,
    {
      new: true
    }
  );

  if (!trustedIp)
    return res.status(400).send({
      message: "Failed to update trusted IP"
    });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_TRUSTED_IP,
      metadata: {
        trustedIpId: trustedIp._id.toString(),
        ipAddress: trustedIp.ipAddress,
        prefix: trustedIp.prefix
      }
    },
    {
      workspaceId: trustedIp.workspace
    }
  );

  return res.status(200).send({
    trustedIp
  });
};

/**
 * Delete IP access range from workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const deleteWorkspaceTrustedIp = async (req: Request, res: Response) => {
  const {
    params: { workspaceId, trustedIpId }
  } = await validateRequest(DeleteWorkspaceTrustedIpV1, req);

  const { permission } = await getAuthDataProjectPermissions({
    authData: req.authData,
    workspaceId: new Types.ObjectId(workspaceId)
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.IpAllowList
  );

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) throw BadRequestError({ message: "Workspace not found" });

  const plan = await EELicenseService.getPlan(workspace.organization);

  if (!plan.ipAllowlisting)
    return res.status(400).send({
      message:
        "Failed to delete IP access range due to plan restriction. Upgrade plan to delete IP access range."
    });

  const trustedIp = await TrustedIP.findOneAndDelete({
    _id: new Types.ObjectId(trustedIpId),
    workspace: new Types.ObjectId(workspaceId)
  });

  if (!trustedIp)
    return res.status(400).send({
      message: "Failed to delete trusted IP"
    });

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.DELETE_TRUSTED_IP,
      metadata: {
        trustedIpId: trustedIp._id.toString(),
        ipAddress: trustedIp.ipAddress,
        prefix: trustedIp.prefix
      }
    },
    {
      workspaceId: trustedIp.workspace
    }
  );

  return res.status(200).send({
    trustedIp
  });
};
