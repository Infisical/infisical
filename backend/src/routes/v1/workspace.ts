import express from 'express';
const router = express.Router();
import { body, param, query } from 'express-validator';
import {
	requireAuth,
	requireWorkspaceAuth,
	validateRequest
} from '../../middleware';
import { ADMIN, MEMBER } from '../../variables';
import { workspaceController, membershipController } from '../../controllers/v1';

router.get(
	'/:workspaceId/keys',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspacePublicKeys
);

router.get(
	'/:workspaceId/users',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER],
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceMemberships
);

router.get(
	'/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	workspaceController.getWorkspaces
);

router.get(
	'/:workspaceId',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspace
);

router.post(
	'/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	body('workspaceName').exists().trim().notEmpty(),
	body('organizationId').exists().trim().notEmpty(),
	validateRequest,
	workspaceController.createWorkspace
);

router.delete(
	'/:workspaceId',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.deleteWorkspace
);

router.post(
	'/:workspaceId/name',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	body('name').exists().trim().notEmpty(),
	validateRequest,
	workspaceController.changeWorkspaceName
);

router.post(
	'/:workspaceId/invite-signup',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	body('email').exists().trim().notEmpty(),
	validateRequest,
	membershipController.inviteUserToWorkspace
);

router.get(
	'/:workspaceId/integrations',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrations
);

router.get(
	'/:workspaceId/authorizations',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceIntegrationAuthorizations
);

router.post(
	'/:workspaceId/approvers',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN]
	}),
	param('workspaceId').exists().trim(),
	body("approvers").isArray(),
	validateRequest,
	workspaceController.addApproverForWorkspaceAndEnvironment
);

router.delete(
	'/:workspaceId/approvers',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN]
	}),
	param('workspaceId').exists().trim(),
	body("approvers").isArray(),
	validateRequest,
	workspaceController.removeApproverForWorkspaceAndEnvironment
);

router.get(
	'/:workspaceId/service-tokens', // deprecate
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireWorkspaceAuth({
		acceptedRoles: [ADMIN, MEMBER]
	}),
	param('workspaceId').exists().trim(),
	validateRequest,
	workspaceController.getWorkspaceServiceTokens
);

export default router;
