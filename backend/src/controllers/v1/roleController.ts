import { Request, Response } from "express";
import { BadRequestError } from "../../utils/errors";
import Role from "../../models/role";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  adminPermissions,
  getUserOrgPermissions,
  memberPermissions
} from "../../services/RoleService";
import { validateRequest } from "../../helpers/validation";
import {
  CreateRoleSchema,
  DeleteRoleSchema,
  GetRoleSchema,
  GetUserPermission,
  GetUserProjectPermission,
  UpdateRoleSchema
} from "../../validation";
import { packRules } from "@casl/ability/extra";
import {
  adminProjectPermissions,
  getUserProjectPermissions,
  viewerProjectPermission
} from "../../services/ProjectRoleService";

export const createRole = async (req: Request, res: Response) => {
  const {
    body: { workspaceId, name, description, slug, permissions, orgId }
  } = await validateRequest(CreateRoleSchema, req);

  const { permission } = await getUserOrgPermissions(req.user.id, orgId);
  if (permission.cannot(OrgPermissionActions.Create, OrgPermissionSubjects.Role)) {
    throw BadRequestError({ message: "User doesn't have the permission." });
  }

  const isOrgRole = !workspaceId; // if workspaceid is provided then its a workspace rule

  const existingRole = await Role.findOne({ organization: orgId, workspace: workspaceId, slug });
  if (existingRole) {
    throw BadRequestError({ message: "Role already exist" });
  }

  const role = new Role({
    organization: orgId,
    workspace: workspaceId,
    isOrgRole,
    name,
    slug,
    permissions,
    description
  });
  await role.save();

  res.status(200).json({
    message: "Successfully created role",
    data: {
      role
    }
  });
};

export const updateRole = async (req: Request, res: Response) => {
  const {
    params: { id },
    body: { name, description, slug, permissions, workspaceId, orgId }
  } = await validateRequest(UpdateRoleSchema, req);
  const isOrgRole = !workspaceId; // if workspaceid is provided then its a workspace rule

  const { permission } = await getUserOrgPermissions(req.user.id, orgId);
  if (permission.cannot(OrgPermissionActions.Edit, OrgPermissionSubjects.Role)) {
    throw BadRequestError({ message: "User doesn't have the permission." });
  }

  if (slug) {
    const existingRole = await Role.findOne({
      organization: orgId,
      slug,
      isOrgRole,
      workspace: workspaceId
    });
    if (existingRole && existingRole.id !== id) {
      throw BadRequestError({ message: "Role already exist" });
    }
  }

  const role = await Role.findByIdAndUpdate(
    id,
    { name, description, slug, permissions },
    { returnDocument: "after" }
  );

  if (!role) {
    throw BadRequestError({ message: "Role not found" });
  }
  res.status(200).json({
    message: "Successfully updated role",
    data: {
      role
    }
  });
};

export const deleteRole = async (req: Request, res: Response) => {
  const {
    params: { id }
  } = await validateRequest(DeleteRoleSchema, req);

  const role = await Role.findById(id);
  if (!role) {
    throw BadRequestError({ message: "Role not found" });
  }

  const { permission } = await getUserOrgPermissions(req.user.id, role.organization.toString());
  if (permission.cannot(OrgPermissionActions.Delete, OrgPermissionSubjects.Role)) {
    throw BadRequestError({ message: "User doesn't have the permission." });
  }
  await Role.findByIdAndDelete(role.id);

  res.status(200).json({
    message: "Successfully deleted role",
    data: {
      role
    }
  });
};

export const getRoles = async (req: Request, res: Response) => {
  const {
    query: { workspaceId, orgId }
  } = await validateRequest(GetRoleSchema, req);
  const isOrgRole = !workspaceId;

  const { permission } = await getUserOrgPermissions(req.user.id, orgId);
  if (permission.cannot(OrgPermissionActions.Read, OrgPermissionSubjects.Role)) {
    throw BadRequestError({ message: "User doesn't have the permission." });
  }

  const customRoles = await Role.find({ organization: orgId, isOrgRole, workspace: workspaceId });
  const roles = [
    ...(isOrgRole
      ? [
          {
            _id: "owner",
            name: "Owner",
            slug: "owner",
            description: "Complete administration access over the organization.",
            permissions: adminPermissions.rules
          }
        ]
      : []),
    {
      _id: "admin",
      name: "Admin",
      slug: "admin",
      description: "Complete administration access over the organization",
      permissions: isOrgRole ? adminPermissions.rules : adminProjectPermissions.rules
    },
    {
      _id: "member",
      name: "Member",
      slug: "member",
      description: "Non-administrative role in an organization",
      permissions: isOrgRole ? memberPermissions.rules : adminProjectPermissions.rules
    },
    ...(isOrgRole
      ? []
      : [
          {
            _id: "viewer",
            name: "Viewer",
            slug: "viewer",
            description: "Non-administrative role in an organization",
            permissions: isOrgRole ? viewerProjectPermission.rules : viewerProjectPermission.rules
          }
        ]),
    ...customRoles
  ];

  res.status(200).json({
    message: "Successfully fetched role list",
    data: {
      roles
    }
  });
};

export const getUserPermissions = async (req: Request, res: Response) => {
  const {
    params: { orgId }
  } = await validateRequest(GetUserPermission, req);
  const { permission } = await getUserOrgPermissions(req.user.id, orgId);

  res.status(200).json({
    data: {
      permissions: packRules(permission.rules)
    }
  });
};

export const getUserWorkspacePermissions = async (req: Request, res: Response) => {
  const {
    params: { workspaceId }
  } = await validateRequest(GetUserProjectPermission, req);
  const { permission } = await getUserProjectPermissions(req.user.id, workspaceId);
  res.status(200).json({
    data: {
      permissions: packRules(permission.rules)
    }
  });
};
