import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../middleware';
import { ADMIN, MEMBER, COMPLETED, GRANTED } from '../variables';
import { workspaceController, membershipController } from '../controllers';

router.get(
	'/:workspaceId/keys',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspacePublicKeys
);

router.get(
	'/:workspaceId/users',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceMemberships
);

router.get('/', requireAuth, workspaceController.getWorkspaces);

router.get(
	'/:workspaceId',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspace
);

router.post(
	'/',
	requireAuth,
	body('workspaceName').exists().trim().notEmpty(),
	body('organizationId').exists().trim().notEmpty(),
	validateRequest,
	workspaceController.createWorkspace
);

router.delete(
	'/:workspaceId',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.deleteWorkspace
);

router.post(
	'/:workspaceId/name',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [COMPLETED, GRANTED]
	}),
	param('workspaceId').exists().trim(),
	body('name').exists().trim().notEmpty(),
	validateRequest,
	workspaceController.changeWorkspaceName
);

router.post(
	'/:workspaceId/invite-signup',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	body('email').exists().trim().notEmpty(),
	validateRequest,
	membershipController.inviteUserToWorkspace
);

router.get(
	'/:workspaceId/integrations',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrations
);

router.get(
	'/:workspaceId/authorizations',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrationAuthorizations
);

router.get(
	'/:workspaceId/service-tokens',
	requireAuth,
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
		acceptedStatuses: [GRANTED]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceServiceTokens
);

export default router;
