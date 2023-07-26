import { Request, Response } from "express";
import { PipelineStage, Types } from "mongoose";
import { Secret } from "../../../models";
import {
  FolderVersion,
  IPType,
  ISecretVersion,
  Log,
  SecretSnapshot,
  SecretVersion,
  TFolderRootVersionSchema,
  TrustedIP
} from "../../models";
import { EESecretService } from "../../services";
import { getLatestSecretVersionIds } from "../../helpers/secretVersion";
import Folder, { TFolderSchema } from "../../../models/folder";
import { searchByFolderId } from "../../../services/FolderService";
import { EELicenseService } from "../../services";
import { extractIPDetails, isValidIpOrCidr } from "../../../utils/ip";

/**
 * Return secret snapshots for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const getWorkspaceSecretSnapshots = async (
  req: Request,
  res: Response
) => {
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
  const { workspaceId } = req.params;
  const { environment, folderId } = req.query;

  const offset: number = parseInt(req.query.offset as string);
  const limit: number = parseInt(req.query.limit as string);

  const secretSnapshots = await SecretSnapshot.find({
    workspace: workspaceId,
    environment,
    folderId: folderId || "root",
  })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);

  return res.status(200).send({
    secretSnapshots,
  });
};

/**
 * Return count of secret snapshots for workspace with id [workspaceId]
 * @param req
 * @param res
 */
export const getWorkspaceSecretSnapshotsCount = async (
  req: Request,
  res: Response
) => {
  const { workspaceId } = req.params;
  const { environment, folderId } = req.query;

  const count = await SecretSnapshot.countDocuments({
    workspace: workspaceId,
    environment,
    folderId: folderId || "root",
  });

  return res.status(200).send({
    count,
  });
};

/**
 * Rollback secret snapshot with id [secretSnapshotId] to version [version]
 * @param req
 * @param res
 * @returns
 */
export const rollbackWorkspaceSecretSnapshot = async (
  req: Request,
  res: Response
) => {
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

  const { workspaceId } = req.params;
  const { version, environment, folderId = "root" } = req.body;

  // validate secret snapshot
  const secretSnapshot = await SecretSnapshot.findOne({
    workspace: workspaceId,
    version,
    environment,
    folderId: folderId,
  })
    .populate<{ secretVersions: ISecretVersion[] }>({
      path: "secretVersions",
      select: "+secretBlindIndex",
    })
    .populate<{ folderVersion: TFolderRootVersionSchema }>("folderVersion");

  if (!secretSnapshot) throw new Error("Failed to find secret snapshot");

  const snapshotFolderTree = secretSnapshot.folderVersion;
  const latestFolderTree = await Folder.findOne({
    workspace: workspaceId,
    environment,
  });

  const latestFolderVersion = await FolderVersion.findOne({
    environment,
    workspace: workspaceId,
    "nodes.id": folderId,
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
  const newFolderTree =
    latestFolderTree && searchByFolderId(latestFolderTree.nodes, folderId);

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
            $in: Object.keys(groupByFolderId),
          },
        },
      };
      const sortByFolderIdAndVersion: PipelineStage = {
        $sort: { folderId: 1, version: -1 },
      };
      const pickLatestVersionOfEachFolder = {
        $group: {
          _id: "$folderId",
          latestVersion: { $first: "$version" },
          doc: {
            $first: "$$ROOT",
          },
        },
      };
      const populateSecVersion = {
        $lookup: {
          from: SecretVersion.collection.name,
          localField: "doc.secretVersions",
          foreignField: "_id",
          as: "doc.secretVersions",
        },
      };
      const populateFolderVersion = {
        $lookup: {
          from: FolderVersion.collection.name,
          localField: "doc.folderVersion",
          foreignField: "_id",
          as: "doc.folderVersion",
        },
      };
      const unwindFolderVerField = {
        $unwind: {
          path: "$doc.folderVersion",
          preserveNullAndEmptyArrays: true,
        },
      };
      const latestSnapshotsByFolders: Array<{ doc: typeof secretSnapshot }> =
        await SecretSnapshot.aggregate([
          matchWsFoldersPipeline,
          sortByFolderIdAndVersion,
          pickLatestVersionOfEachFolder,
          populateSecVersion,
          populateFolderVersion,
          unwindFolderVerField,
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
    secretIds,
  });

  // TODO: fix any
  const latestSecretVersions: any = (
    await SecretVersion.find(
      {
        _id: {
          $in: latestSecretVersionIds.map((s) => s.versionId),
        },
      },
      "secret version"
    )
  ).reduce(
    (accumulator, s) => ({
      ...accumulator,
      [`${s.secret.toString()}`]: s,
    }),
    {}
  );

  const secDelQuery: Record<string, unknown> = {
    workspace: workspaceId,
    environment,
    // undefined means root thus collect all secrets
  };
  if (folderId !== "root" && folderIds.length)
    secDelQuery.folder = { $in: folderIds };

  // delete existing secrets
  await Secret.deleteMany(secDelQuery);
  await Folder.deleteOne({
    workspace: workspaceId,
    environment,
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
        folder: secFolderId,
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
        folder: secFolderId,
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
        folder: secFolderId,
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
        folder: secFolderId,
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
      nodes: newFolderTree,
    });
    await newFolderVersion.save();
  }

  // update secret versions of restored secrets as not deleted
  await SecretVersion.updateMany(
    {
      secret: {
        $in: Object.keys(oldSecretVersionsObj).map(
          (sv) => oldSecretVersionsObj[sv].secret
        ),
      },
    },
    {
      isDeleted: false,
    }
  );

  // take secret snapshot
  await EESecretService.takeSecretSnapshot({
    workspaceId: new Types.ObjectId(workspaceId),
    environment,
    folderId,
  });

  return res.status(200).send({
    secrets,
  });
};

/**
 * Return (audit) logs for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceLogs = async (req: Request, res: Response) => {
  /* 
    #swagger.summary = 'Return project (audit) logs'
    #swagger.description = 'Return project (audit) logs'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['workspaceId'] = {
		"description": "ID of project",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['userId'] = {
		"description": "ID of project member",
		"required": false,
		"type": "string"
	} 

	#swagger.parameters['offset'] = {
		"description": "Number of logs to skip",
		"required": false,
		"type": "string"
	}

	#swagger.parameters['limit'] = {
		"description": "Maximum number of logs to return",
		"required": false,
		"type": "string"
	}

	#swagger.parameters['sortBy'] = {
		"description": "Order to sort the logs by",
		"schema": {
			"type": "string",
			"@enum": ["oldest", "recent"]
		},
		"required": false
	}

	#swagger.parameters['actionNames'] = {
		"description": "Names of log actions (comma-separated)",
		"required": false,
		"type": "string"
	}

    #swagger.responses[200] = {
        content: {
            "application/json": {
                schema: { 
					"type": "object",
					"properties": {
						"logs": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/Log" 
							},
							"description": "Project logs"
						}
					}
                }
            }           
        }
    }   
    */
  const { workspaceId } = req.params;

  const offset: number = parseInt(req.query.offset as string);
  const limit: number = parseInt(req.query.limit as string);
  const sortBy: string = req.query.sortBy as string;
  const userId: string = req.query.userId as string;
  const actionNames: string = req.query.actionNames as string;

  const logs = await Log.find({
    workspace: workspaceId,
    ...(userId ? { user: userId } : {}),
    ...(actionNames
      ? {
          actionNames: {
            $in: actionNames.split(","),
          },
        }
      : {}),
  })
    .sort({ createdAt: sortBy === "recent" ? -1 : 1 })
    .skip(offset)
    .limit(limit)
    .populate("actions")
    .populate("user serviceAccount serviceTokenData");

  return res.status(200).send({
    logs,
  });
};

/**
 * Return trusted ips for workspace with id [workspaceId]
 * @param req
 * @param res 
 */
export const getWorkspaceTrustedIps = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  const trustedIps = await TrustedIP.find({
    workspace: new Types.ObjectId(workspaceId)
  });
    
  return res.status(200).send({
    trustedIps
  });
}

/**
 * Add a trusted ip to workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
export const addWorkspaceTrustedIp = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const {
    ipAddress: ip,
    comment,
    isActive
  } = req.body;
  
  const plan = await EELicenseService.getPlan(req.workspace.organization.toString());
  
  if (!plan.ipAllowlisting) return res.status(400).send({
    message: "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
  });
  
  const isValidIPOrCidr = isValidIpOrCidr(ip);
  
  if (!isValidIPOrCidr) return res.status(400).send({
    message: "The IP is not a valid IPv4, IPv6, or CIDR block"
  });
  
  const { ipAddress, type, prefix } = extractIPDetails(ip);

  const trustedIp = await new TrustedIP({
    workspace: new Types.ObjectId(workspaceId),
    ipAddress,
    type,
    prefix,
    isActive,
    comment,
  }).save();

  return res.status(200).send({
    trustedIp
  });
}

/**
 * Update trusted ip with id [trustedIpId] workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
export const updateWorkspaceTrustedIp = async (req: Request, res: Response) => {
  const { workspaceId, trustedIpId } = req.params;
  const {
    ipAddress: ip,
    comment
  } = req.body;

  const plan = await EELicenseService.getPlan(req.workspace.organization.toString());

  if (!plan.ipAllowlisting) return res.status(400).send({
    message: "Failed to update IP access range due to plan restriction. Upgrade plan to update IP access range."
  });

  const isValidIPOrCidr = isValidIpOrCidr(ip);
  
  if (!isValidIPOrCidr) return res.status(400).send({
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
    }
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
      workspace: new Types.ObjectId(workspaceId),
    },
    updateObject,
    {
      new: true
    }
  );
  
  return res.status(200).send({
    trustedIp
  });
}

/**
 * Delete IP access range from workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
export const deleteWorkspaceTrustedIp = async (req: Request, res: Response) => {
  const { workspaceId, trustedIpId } = req.params;

  const plan = await EELicenseService.getPlan(req.workspace.organization.toString());
  
  if (!plan.ipAllowlisting) return res.status(400).send({
    message: "Failed to delete IP access range due to plan restriction. Upgrade plan to delete IP access range."
  });
  
  const trustedIp = await TrustedIP.findOneAndDelete({
    _id: new Types.ObjectId(trustedIpId),
    workspace: new Types.ObjectId(workspaceId)
  });

  return res.status(200).send({
    trustedIp
  });
}