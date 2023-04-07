import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import {
	ADMIN, 
	MEMBER,
	AUTH_MODE_JWT
} from '../../variables';
import { workspaceController, membershipController } from '../../controllers/v1';

router.get(
	'/:workspaceId/keys',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspacePublicKeys
);

router.get(
	'/:workspaceId/users',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceMemberships
);

router.get(
	'/', 
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}), 
	workspaceController.getWorkspaces
);

router.get(
	'/:workspaceId',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspace
);

router.post(
	'/',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	body('workspaceName').exists().trim().notEmpty(),
	body('organizationId').exists().trim().notEmpty(),
	validateRequest,
	workspaceController.createWorkspace
);

router.delete(
	'/:workspaceId',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.deleteWorkspace
);

router.post(
	'/:workspaceId/name',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	body('name').exists().trim().notEmpty(),
	validateRequest,
	workspaceController.changeWorkspaceName
);

router.post(
	'/:workspaceId/invite-signup',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	body('email').exists().trim().notEmpty(),
	validateRequest,
	membershipController.inviteUserToWorkspace
);

router.get(
	'/:workspaceId/integrations',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrations
);

router.get(
	'/:workspaceId/authorizations',
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrationAuthorizations
);

router.get(
	'/:workspaceId/service-tokens', // deprecate
	requireAuth({
		acceptedAuthModes: [AUTH_MODE_JWT]
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		locationWorkspaceId: 'params'
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceServiceTokens
);

export default router;
