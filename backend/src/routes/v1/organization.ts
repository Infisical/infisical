import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import {
	requireAuth,
	requireOrganizationAuth,
	validateRequest
} from '../../middleware';
import { OWNER, ADMIN, MEMBER, ACCEPTED } from '../../variables';
import { organizationController } from '../../controllers/v1';

router.get( // deprecated (moved to api/v2/users/me/organizations)
	'/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	organizationController.getOrganizations
);

router.post( // not used on frontend
	'/',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	body('organizationName').exists().trim().notEmpty(),
	validateRequest,
	organizationController.createOrganization
);

router.get(
	'/:organizationId',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganization
);

router.get( // deprecated (moved to api/v2/organizations/:organizationId/memberships)
	'/:organizationId/users',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganizationMembers
);

router.get(
	'/:organizationId/my-workspaces', // deprecated (moved to api/v2/organizations/:organizationId/workspaces)
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganizationWorkspaces
);

router.patch(
	'/:organizationId/name',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	body('name').exists().trim().notEmpty(),
	validateRequest,
	organizationController.changeOrganizationName
);

router.get(
	'/:organizationId/incidentContactOrg',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganizationIncidentContacts
);

router.post(
	'/:organizationId/incidentContactOrg',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	body('email').exists().trim().notEmpty(),
	validateRequest,
	organizationController.addOrganizationIncidentContact
);

router.delete(
	'/:organizationId/incidentContactOrg',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	body('email').exists().trim().notEmpty(),
	validateRequest,
	organizationController.deleteOrganizationIncidentContact
);

router.post(
	'/:organizationId/customer-portal-session',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.createOrganizationPortalSession
);

router.get(
	'/:organizationId/subscriptions',
	requireAuth({
		acceptedAuthModes: ['jwt']
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganizationSubscriptions
);

export default router;
