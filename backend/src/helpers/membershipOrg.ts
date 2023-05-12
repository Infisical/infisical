import { Types } from 'mongoose';
import { 
	MembershipOrg, 
	Workspace, 
	Membership, 
	Key,
	IUser,
	User,
	IServiceAccount,
	ServiceAccount,
	IServiceTokenData,
	ServiceTokenData
} from '../models';
import {
	MembershipOrgNotFoundError,
	BadRequestError,
	UnauthorizedRequestError
} from '../utils/errors';
import {
	AUTH_MODE_JWT,
	AUTH_MODE_SERVICE_ACCOUNT,
	AUTH_MODE_SERVICE_TOKEN,
	AUTH_MODE_API_KEY
} from '../variables';

/**
 * Validate authenticated clients for organization membership with id [membershipOrgId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.membershipOrgId - id of organization membership to validate against
 * @param {Array<'owner' | 'admin' | 'member'>} obj.acceptedRoles - accepted organization roles
 * @param {MembershipOrg} - validated organization membership
 */
const validateClientForMembershipOrg = async ({
	authData,
	membershipOrgId,
	acceptedRoles,
	acceptedStatuses
}: {
	authData: {
		authMode: string;
		authPayload: IUser | IServiceAccount | IServiceTokenData;
	};
	membershipOrgId: Types.ObjectId;
    acceptedRoles: Array<'owner' | 'admin' | 'member'>;
    acceptedStatuses: Array<'invited' | 'accepted'>;
}) => {
	const membershipOrg = await MembershipOrg.findById(membershipOrgId);

	if (!membershipOrg) throw MembershipOrgNotFoundError({
		message: 'Failed to find organization membership '
	});

	if (authData.authMode === AUTH_MODE_JWT && authData.authPayload instanceof User) {
		await validateMembershipOrg({
			userId: authData.authPayload._id,
			organizationId: membershipOrg.organization,
			acceptedRoles,
			acceptedStatuses
		});
		
		return membershipOrg;
	}

	if (authData.authMode === AUTH_MODE_SERVICE_ACCOUNT && authData.authPayload instanceof ServiceAccount) {
		if (!authData.authPayload.organization.equals(membershipOrg.organization)) throw UnauthorizedRequestError({
			message: 'Failed service account client authorization for organization membership'
		});
		
		return membershipOrg;
	}

	if (authData.authMode === AUTH_MODE_SERVICE_TOKEN && authData.authPayload instanceof ServiceTokenData) {
		throw UnauthorizedRequestError({
			message: 'Failed service account client authorization for organization membership'
		});
	}
	
	if (authData.authMode === AUTH_MODE_API_KEY && authData.authPayload instanceof User) {
		await validateMembershipOrg({
			userId: authData.authPayload._id,
			organizationId: membershipOrg.organization,
			acceptedRoles,
			acceptedStatuses
		});
		
		return membershipOrg;
	}
	
	throw UnauthorizedRequestError({
		message: 'Failed client authorization for organization membership'
	});
}

/**
 * Validate that user with id [userId] is a member of organization with id [organizationId]
 * and has at least one of the roles in [acceptedRoles]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.userId
 * @param {Types.ObjectId} obj.organizationId
 * @param {String[]} obj.acceptedRoles
 */
const validateMembershipOrg = async ({
	userId,
	organizationId,
	acceptedRoles,
	acceptedStatuses
}: {
	userId: Types.ObjectId;
	organizationId: Types.ObjectId;
	acceptedRoles?: Array<'owner' | 'admin' | 'member'>;
	acceptedStatuses?: Array<'invited' | 'accepted'>;
}) => {
	const membershipOrg = await MembershipOrg.findOne({
		user: userId,
		organization: organizationId
	});
	
	if (!membershipOrg) {
		throw MembershipOrgNotFoundError({ message: 'Failed to find organization membership' });
	}
	
	if (acceptedRoles) {
		if (!acceptedRoles.includes(membershipOrg.role)) {
			throw UnauthorizedRequestError({ message: 'Failed to validate organization membership role' });
		}
	}
	
	if (acceptedStatuses) {
		if (!acceptedStatuses.includes(membershipOrg.status)) {
			throw UnauthorizedRequestError({ message: 'Failed to validate organization membership status' });
		}
	}
	
	return membershipOrg;
}

/**
 * Return organization membership matching criteria specified in
 * query [queryObj]
 * @param {Object} queryObj - query object
 * @return {Object} membershipOrg - membership
 */
const findMembershipOrg = (queryObj: any) => {
	const membershipOrg = MembershipOrg.findOne(queryObj);
	return membershipOrg;
};

/**
 * Add organization memberships for users with ids [userIds] to organization with
 * id [organizationId]
 * @param {Object} obj
 * @param {String[]} obj.userIds - id of users.
 * @param {String} obj.organizationId - id of organization.
 * @param {String[]} obj.roles - roles of users.
 */
const addMembershipsOrg = async ({
	userIds,
	organizationId,
	roles,
	statuses
}: {
	userIds: string[];
	organizationId: string;
	roles: string[];
	statuses: string[];
}) => {
  const operations = userIds.map((userId, idx) => {
    return {
      updateOne: {
        filter: {
          user: userId,
          organization: organizationId,
          role: roles[idx],
          status: statuses[idx]
        },
        update: {
          user: userId,
          organization: organizationId,
          role: roles[idx],
          status: statuses[idx]
        },
        upsert: true
      }
    };
  });

  await MembershipOrg.bulkWrite(operations as any);
};

/**
 * Delete organization membership with id [membershipOrgId]
 * @param {Object} obj
 * @param {String} obj.membershipOrgId - id of organization membership to delete
 */
const deleteMembershipOrg = async ({
	membershipOrgId
}: {
	membershipOrgId: string;
}) => {
  const deletedMembershipOrg = await MembershipOrg.findOneAndDelete({
    _id: membershipOrgId
  });

  if (!deletedMembershipOrg) throw new Error('Failed to delete organization membership');

  // delete keys associated with organization membership
  if (deletedMembershipOrg?.user) {
    // case: organization membership had a registered user

    const workspaces = (
      await Workspace.find({
        organization: deletedMembershipOrg.organization
      })
    ).map((w) => w._id.toString());

    await Membership.deleteMany({
      user: deletedMembershipOrg.user,
      workspace: {
        $in: workspaces
      }
    });

    await Key.deleteMany({
      receiver: deletedMembershipOrg.user,
      workspace: {
        $in: workspaces
      }
    });
  }

	return deletedMembershipOrg;
};

export {
	validateClientForMembershipOrg,
	validateMembershipOrg,
	findMembershipOrg,
	addMembershipsOrg, 
	deleteMembershipOrg 
}; 
