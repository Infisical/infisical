import express from 'express';
const router = express.Router();
import { body, param } from 'express-validator';
import {
	requireAuth,
	requireOrganizationAuth,
	validateRequest
} from '../middleware';
import { OWNER, ADMIN, MEMBER, ACCEPTED } from '../variables';
import { organizationController } from '../controllers';

router.get(
	'/',
	requireAuth,
	organizationController.getOrganizations
);

router.post( // not used on frontend
	'/',
	requireAuth,
	body('organizationName').exists().trim().notEmpty(),
	validateRequest,
	organizationController.createOrganization
);

router.get(
	'/:organizationId',
	requireAuth,
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganization
);

router.get(
	'/:organizationId/users',
	requireAuth,
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganizationMembers
);

router.get(
	'/:organizationId/my-workspaces',
	requireAuth,
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
	requireAuth,
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
	requireAuth,
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
	requireAuth,
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
	requireAuth,
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
	requireAuth,
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
	requireAuth,
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED]
	}),
	param('organizationId').exists().trim(),
	validateRequest,
	organizationController.getOrganizationSubscriptions
);

export default router;
