import { Types } from 'mongoose';
import {
    Workspace,
    ServiceAccount,
    ServiceAccountKey
} from '../models';
import { 
    WorkspaceNotFoundError,
    ServiceAccountNotFoundError,
    ServiceAccountKeyNotFoundError
} from '../utils/errors';
import {
    PERMISSION_SA_WORKSPACE_READ,
    PERMISSION_SA_WORKSPACE_WRITE,
    PERMISSION_SA_SET
} from '../variables';

/**
 * Validate that user with id [userId] can provision the permission
 * named [name] for a service account with id [serviceAccountId] and 
 * optionally workspace with id [workspaceId] and environment [environment]
 * @param {Object} obj
 * @param {String} obj.name - name of permission to create
 * @param {Types.ObjectId} userId - id of user creating the permission
 * @param {Types.ObjectId} serviceAccountId - id of service account that permission will be bound to
 * @param {Types.ObjectId} workspaceId - id of workspace that permission concerns
 * @param {Types.ObjectId} workspaceId - id of service account that permission will be bound to
 */
const validateCreateServiceAccountPermission = async ({
    name,
    userId,
    serviceAccountId,
    workspaceId,
    environment
}: {
    name: string;
    userId: Types.ObjectId;
    serviceAccountId: Types.ObjectId,
    workspaceId?: Types.ObjectId;
    environment?: string;
}) => {
    
    // TODO: as we upgrade user permissions to be more global, then we should take into account
    // the user's permissions as it concerns to being able to interact with service accounts
    
    if (!PERMISSION_SA_SET.has(name)) throw new Error(`${name} is not a valid permission name`);
    
    if ([
        PERMISSION_SA_WORKSPACE_READ,
        PERMISSION_SA_WORKSPACE_WRITE
    ].includes(name)) {
        if (workspaceId && environment) {
            // case: either workspace id [workspaceId] or environment name [environment] is being passed in
            // (i.e. validating a service account permission concerning a workspace and/or environment)
            const workspace = await Workspace.findById(workspaceId);

            if (!workspace) {
                // case: workspace does not exist
                throw WorkspaceNotFoundError({ message: 'Failed to locate workspace' });
            }
            
            if (!workspace.environments.some((env) => env.slug === environment)) {
                // case: environment name [environment] is not a valid environment slug in workspace
                throw Error('Failed to locate environment in workspace');
            }
            
            const serviceAccount = await ServiceAccount.findById(serviceAccountId);
            if (!serviceAccount) {
                // case: service account does not exist
                throw ServiceAccountNotFoundError({ message: 'Failed to locate service account' });
            }
            
            const serviceAccountKey = await ServiceAccountKey.findOne({
                serviceAccount: serviceAccount._id,
                workspace: workspaceId
            });
            
            if (!serviceAccountKey) {
                // case: service account key does not exist
                throw ServiceAccountKeyNotFoundError({ message: 'Failed to locate service account key' });
            }
        } else {
            throw new Error('Failed to validate workspace and environment for workspace-related permission');
        }
    }
    
}

const validateDeleteServiceAccountPermission = async ({
    userId,
    serviceAccountId,
    name,
    workspaceId,
    environment
}: {
    userId: Types.ObjectId;
    serviceAccountId: Types.ObjectId;
    name: string;
    workspaceId: Types.ObjectId;
    environment: string;
}) => {
    // does the user have the authority to delete the permission?
    // does the service account permission exist?
    
    
}

export {
    validateCreateServiceAccountPermission
}