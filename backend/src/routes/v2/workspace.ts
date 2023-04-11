import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import {
	requireAuth,
	requireMembershipAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import {
	ADMIN, 
	MEMBER,
	AUTH_MODE_JWT,
	AUTH_MODE_SERVICE_TOKEN,
	AUTH_MODE_API_KEY
} from '../../variables';
import { workspaceController } from '../../controllers/v2';

router.post(
	'/:workspaceId/secrets',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	body('secrets').exists(),
	body('keys').exists(),
	body('environment').exists().trim().notEmpty(),
	body('channel'),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.pushWorkspaceSecrets
);

router.get(
	'/:workspaceId/secrets',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_SERVICE_TOKEN]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	query('environment').exists().trim(),
	query('channel'),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.pullSecrets
);

router.get(
	'/:workspaceId/encrypted-key',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceKey
);

router.get(
	'/:workspaceId/service-token-data',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceServiceTokenData
);

router.get( // new - TODO: rewire dashboard to this route
	'/:workspaceId/memberships',
	param('workspaceId').exists().trim(),
	validateRequest,
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	workspaceController.getWorkspaceMemberships
);

router.patch( // TODO - rewire dashboard to this route
	'/:workspaceId/memberships/:membershipId',
	param('workspaceId').exists().trim(),
	param('membershipId').exists().trim(),
	body('role').exists().isString().trim().isIn([ADMIN, MEMBER]),
	validateRequest,
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN],
		locationWorkspaceId: 'params'
	}),
	requireMembershipAuth({
		acceptedRoles: [ADMIN]
	}),
	workspaceController.updateWorkspaceMembership
);

router.delete( // TODO - rewire dashboard to this route
	'/:workspaceId/memberships/:membershipId',
	param('workspaceId').exists().trim(),
	param('membershipId').exists().trim(),
	validateRequest,
	requireAuth({
        acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_API_KEY]
    }),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN],
		locationWorkspaceId: 'params'
	}),
	requireMembershipAuth({
		acceptedRoles: [ADMIN]
	}),
	workspaceController.deleteWorkspaceMembership
);

router.patch(
	'/:workspaceId/auto-capitalization',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	body('autoCapitalization').exists().trim().notEmpty(),
	validateRequest,
	workspaceController.toggleAutoCapitalization
);

export default router;
