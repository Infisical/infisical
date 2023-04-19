import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Types } from 'mongoose';
import {
	Secret
} from '../../../models';
import { 
	SecretSnapshot,
	Log,
	SecretVersion,
	ISecretVersion
} from '../../models';
import { EESecretService } from '../../services';
import { getLatestSecretVersionIds } from '../../helpers/secretVersion';

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
	let secretSnapshots;
	try {
		const { workspaceId } = req.params;

		const offset: number = parseInt(req.query.offset as string);
		const limit: number = parseInt(req.query.limit as string);
		
		secretSnapshots = await SecretSnapshot.find({
			workspace: workspaceId
		})
		.sort({ createdAt: -1 })
		.skip(offset)
		.limit(limit);

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get secret snapshots'
		});
	}
	
	return res.status(200).send({
		secretSnapshots
	});
}

/**
 * Return count of secret snapshots for workspace with id [workspaceId]
 * @param req 
 * @param res 
 */
export const getWorkspaceSecretSnapshotsCount = async (req: Request, res: Response) => {
	let count;
	try {
		const { workspaceId } = req.params;
		count = await SecretSnapshot.countDocuments({
			workspace: workspaceId
		});
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to count number of secret snapshots'
		});
	}
	
	return res.status(200).send({
		count
	});
}

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
	
	let secrets;
    try {	
        const { workspaceId } = req.params;
        const { version } = req.body;
        
		// validate secret snapshot
		const secretSnapshot = await SecretSnapshot.findOne({
			workspace: workspaceId,
			version
		}).populate<{ secretVersions: ISecretVersion[]}>({
			path: 'secretVersions',
			select: '+secretBlindIndex'
		});
        
        if (!secretSnapshot) throw new Error('Failed to find secret snapshot');

		// TODO: fix any
		const oldSecretVersionsObj: any = secretSnapshot.secretVersions
			.reduce((accumulator, s) => ({ 
				...accumulator, 
				[`${s.secret.toString()}`]: s 
			}), {});	
		
		const latestSecretVersionIds = await getLatestSecretVersionIds({
			secretIds: secretSnapshot.secretVersions.map((sv) => sv.secret)
		});
		
		// TODO: fix any
		const latestSecretVersions: any = (await SecretVersion.find({
			_id: {
				$in: latestSecretVersionIds.map((s) => s.versionId)
			}
		}, 'secret version'))
		.reduce((accumulator, s) => ({ 
			...accumulator, 
			[`${s.secret.toString()}`]: s 
		}), {});
		
		// delete existing secrets
		await Secret.deleteMany({
			workspace: workspaceId
		});

		// add secrets
        secrets = await Secret.insertMany(
			secretSnapshot.secretVersions.map((sv) => {
				const secretId = sv.secret;
				const {
					workspace,
					type,
					user,
					environment,
					secretBlindIndex,
					secretKeyCiphertext,
					secretKeyIV,
					secretKeyTag,
					secretKeyHash,
					secretValueCiphertext,
					secretValueIV,
					secretValueTag,
					secretValueHash,
					createdAt
				} = oldSecretVersionsObj[secretId.toString()];
				
				return ({
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
					secretKeyHash,
					secretValueCiphertext,
					secretValueIV,
					secretValueTag,
					secretValueHash,
					secretCommentCiphertext: '',
					secretCommentIV: '',
					secretCommentTag: '',
					createdAt
				});
			})
		);
		
		// add secret versions
		const secretV = await SecretVersion.insertMany(
			secrets.map(({
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
				secretKeyHash,
				secretValueCiphertext,
				secretValueIV,
				secretValueTag,
				secretValueHash
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
				secretKeyHash,
				secretValueCiphertext,
				secretValueIV,
				secretValueTag,
				secretValueHash
			}))
		);
		
		// update secret versions of restored secrets as not deleted
		await SecretVersion.updateMany({
			secret: {
				$in: secretSnapshot.secretVersions.map((sv) => sv.secret)
			}
		}, {
			isDeleted: false
		});
		
        // take secret snapshot
		await EESecretService.takeSecretSnapshot({
			workspaceId: new Types.ObjectId(workspaceId)
		});
    } catch (err) {
        Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to roll back secret snapshot'
		}); 
    }
    
	return res.status(200).send({
		secrets
	});
}

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
	let logs
	try {
		const { workspaceId } = req.params;

		const offset: number = parseInt(req.query.offset as string);
		const limit: number = parseInt(req.query.limit as string);
		const sortBy: string = req.query.sortBy as string;
		const userId: string = req.query.userId as string;
		const actionNames: string = req.query.actionNames as string;
		
		logs = await Log.find({
			workspace: workspaceId,
			...( userId ? { user: userId } : {}),
			...( 
				actionNames 
				? { 
					actionNames: {
						$in: actionNames.split(',')
					}
				} : {}
			)
		})
		.sort({ createdAt: sortBy === 'recent' ? -1 : 1 })
		.skip(offset)
		.limit(limit)
		.populate('actions')
		.populate('user serviceAccount serviceTokenData');

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get workspace logs'
		});
	}
	
	return res.status(200).send({
		logs
	});
}