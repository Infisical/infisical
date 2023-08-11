import express from "express";
const router = express.Router();

// TODO endpoint: deprecate all

// import {
//     requireAuth,
//     requireOrganizationAuth,
//     requireServiceAccountAuth,
//     requireServiceAccountWorkspacePermissionAuth,
//     requireWorkspaceAuth,
//     validateRequest,
// } from "../../middleware";
// import { body, param, query } from "express-validator";
// import {
//     ACCEPTED,
//     ADMIN,
//     MEMBER,
//     OWNER,
//     AuthMode
// } from "../../variables";
// import { serviceAccountsController } from "../../controllers/v2";

// router.get( // TODO: check
//     "/me",
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_SERVICE_ACCOUNT],
//     }),
//     serviceAccountsController.getCurrentServiceAccount
// );

// router.get(
//     "/:serviceAccountId",
//     param("serviceAccountId").exists().isString().trim(),
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT],
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }),
//     serviceAccountsController.getServiceAccountById
// );

// router.post(
//     "/",
//     body("organizationId").exists().isString().trim(),
//     body("name").exists().isString().trim(),
//     body("publicKey").exists().isString().trim(),
//     body("expiresIn").isNumeric(), // measured in ms
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT],
//     }),
//     requireOrganizationAuth({
//         acceptedRoles: [OWNER, ADMIN, MEMBER],
//         acceptedStatuses: [ACCEPTED],
//         locationOrganizationId: "body",
//     }),
//     serviceAccountsController.createServiceAccount
// );

// router.patch(
//     "/:serviceAccountId/name",
//     param("serviceAccountId").exists().isString().trim(),
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT],
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }),
//     serviceAccountsController.changeServiceAccountName
// );

// router.delete(
//     "/:serviceAccountId",
//     param("serviceAccountId").exists().isString().trim(),
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT],
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }),
//     serviceAccountsController.deleteServiceAccount
// );

// router.get(
//     "/:serviceAccountId/permissions/workspace",
//     param("serviceAccountId").exists().isString().trim(),
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT],
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }),
//     serviceAccountsController.getServiceAccountWorkspacePermissions
// );

// router.post(
//     "/:serviceAccountId/permissions/workspace",
//     param("serviceAccountId").exists().isString().trim(),
//     body("workspaceId").exists().isString().notEmpty(),
//     body("environment").exists().isString().notEmpty(),
//     body("read").isBoolean().optional(),
//     body("write").isBoolean().optional(),
//     body("encryptedKey").exists().isString().notEmpty(),
//     body("nonce").exists().isString().notEmpty(),
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT],
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }),
//     requireWorkspaceAuth({
//         acceptedRoles: [ADMIN, MEMBER],
//         locationWorkspaceId: "body",
//     }),
//     serviceAccountsController.addServiceAccountWorkspacePermission 
// );

// router.delete(
//     "/:serviceAccountId/permissions/workspace/:serviceAccountWorkspacePermissionId",
//     param("serviceAccountId").exists().isString().trim(),
//     param("serviceAccountWorkspacePermissionId").exists().isString().trim(),
//     validateRequest,
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT],
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }), 
//     requireServiceAccountWorkspacePermissionAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }),
//     serviceAccountsController.deleteServiceAccountWorkspacePermission
// );

// router.get(
//     "/:serviceAccountId/keys",
//     query("workspaceId").optional().isString(),
//     requireAuth({
//         acceptedAuthModes: [AUTH_MODE_JWT, AUTH_MODE_SERVICE_ACCOUNT],
//     }),
//     requireServiceAccountAuth({
//         acceptedRoles: [OWNER, ADMIN],
//         acceptedStatuses: [ACCEPTED],
//     }), 
//     serviceAccountsController.getServiceAccountKeys
// );

export default router;