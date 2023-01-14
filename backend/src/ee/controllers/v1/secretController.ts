import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Secret } from '../../../models';
import { SecretVersion } from '../../models';
import { EESecretService } from '../../services';

/**
 * Return secret versions for secret with id [secretId]
 * @param req 
 * @param res 
 */
 export const getSecretVersions = async (req: Request, res: Response) => {
	/* 
    #swagger.summary = 'Return secret versions'
    #swagger.description = 'Return secret versions'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['secretId'] = {
		"description": "ID of secret",
		"required": true,
		"type": "string"
	} 

	#swagger.parameters['offset'] = {
		"description": "Number of versions to skip",
		"required": false,
		"type": "string"
	}

	#swagger.parameters['limit'] = {
		"description": "Maximum number of versions to return",
		"required": false,
		"type": "string"
	}

    #swagger.responses[200] = {
        content: {
            "application/json": {
                schema: { 
                    "type": "object",
					"properties": {
						"secretVersions": {
							"type": "array",
							"items": {
								$ref: "#/components/schemas/SecretVersion" 
							},
							"description": "Secret versions"
						}
					}
                }
            }           
        }
    }   
    */
	let secretVersions;
	try {
		const { secretId } = req.params;

		const offset: number = parseInt(req.query.offset as string);
		const limit: number = parseInt(req.query.limit as string);
		
		secretVersions = await SecretVersion.find({
			secret: secretId
		})
		.sort({ createdAt: -1 })
		.skip(offset)
		.limit(limit);

	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to get secret versions'
		});
	}
	
	return res.status(200).send({
		secretVersions
	});
}

/**
 * Roll back secret with id [secretId] to version [version]
 * @param req 
 * @param res 
 * @returns 
 */
export const rollbackSecretVersion = async (req: Request, res: Response) => {
	/* 
    #swagger.summary = 'Roll back secret to a version.'
    #swagger.description = 'Roll back secret to a version.'
    
    #swagger.security = [{
        "apiKeyAuth": []
    }]

	#swagger.parameters['secretId'] = {
		"description": "ID of secret",
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
                    "description": "Version of secret to roll back to"
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
						"secret": {
							"type": "object",
							$ref: "#/components/schemas/Secret",
							"description": "Secret rolled back to"
						}
					}
                }
            }           
        }
    }   
    */
	let secret;
	try {
		const { secretId } = req.params;
		const { version } = req.body;
		
		// validate secret version
		const oldSecretVersion = await SecretVersion.findOne({
			secret: secretId,
			version
		});
		
		if (!oldSecretVersion) throw new Error('Failed to find secret version');
		
		const {
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
			secretValueHash
		} = oldSecretVersion;
		
		// update secret
		secret = await Secret.findByIdAndUpdate(
			secretId,
			{
				$inc: {
					version: 1
				},
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
				secretValueHash
			},
			{
				new: true
			}
		);
		
		if (!secret) throw new Error('Failed to find and update secret');

		// add new secret version
		await new SecretVersion({
			secret: secretId,
			version: secret.version,
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
			secretValueHash	
		}).save();
		
		// take secret snapshot
		await EESecretService.takeSecretSnapshot({
			workspaceId: secret.workspace.toString()
		});
		
	} catch (err) {
		Sentry.setUser({ email: req.user.email });
		Sentry.captureException(err);
		return res.status(400).send({
			message: 'Failed to roll back secret version'
		});
	}
	
	return res.status(200).send({
		secret
	});
}