import express from "express";
const router = express.Router();
import { body, param } from "express-validator";
import {
	requireAuth,
	requireOrganizationAuth,
	validateRequest,
} from "../../middleware";
import {
	ACCEPTED, 
	ADMIN, 
	AuthMode,
	MEMBER,
	OWNER
} from "../../variables";
import { organizationController } from "../../controllers/v1";

router.get( // TODO endpoint: deprecate (moved to api/v2/users/me/organizations)
	"/",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	organizationController.getOrganizations
);

router.post( // not used on frontend
	"/",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	body("organizationName").exists().trim().notEmpty(),
	validateRequest,
	organizationController.createOrganization
);

router.get(
	"/:organizationId",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	validateRequest,
	organizationController.getOrganization
);

router.get( // TODO endpoint: deprecate (moved to api/v2/organizations/:organizationId/memberships)
	"/:organizationId/users",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	validateRequest,
	organizationController.getOrganizationMembers
);

router.get( // TODO endpoint: move to /v2/users/me/organizations/:organizationId/workspaces
	"/:organizationId/my-workspaces", // deprecated (moved to api/v2/organizations/:organizationId/workspaces)
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	validateRequest,
	organizationController.getOrganizationWorkspaces
);

router.patch(
	"/:organizationId/name",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	body("name").exists().trim().notEmpty(),
	validateRequest,
	organizationController.changeOrganizationName
);

router.get(
	"/:organizationId/incidentContactOrg",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	validateRequest,
	organizationController.getOrganizationIncidentContacts
);

router.post(
	"/:organizationId/incidentContactOrg",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	body("email").exists().trim().notEmpty(),
	validateRequest,
	organizationController.addOrganizationIncidentContact
);

router.delete(
	"/:organizationId/incidentContactOrg",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	body("email").exists().trim().notEmpty(),
	validateRequest,
	organizationController.deleteOrganizationIncidentContact
);

router.post(
	"/:organizationId/customer-portal-session", // TODO endpoint: move to EE
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT],
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	validateRequest,
	organizationController.createOrganizationPortalSession
);

router.get(
	"/:organizationId/workspace-memberships",
	requireAuth({
		acceptedAuthModes: [AuthMode.JWT]
	}),
	requireOrganizationAuth({
		acceptedRoles: [OWNER, ADMIN, MEMBER],
		acceptedStatuses: [ACCEPTED],
	}),
	param("organizationId").exists().trim(),
	validateRequest,
	organizationController.getOrganizationMembersAndTheirWorkspaces
);


export default router;
