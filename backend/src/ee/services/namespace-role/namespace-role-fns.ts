import { v4 as uuidv4 } from "uuid";

import { NamespaceMembershipRole } from "@app/db/schemas";
import {
  namespaceAdminPermissions,
  namespaceMemberPermissions,
  namespaceNoAccessPermissions
} from "@app/ee/services/permission/namespace-permission";

export const getPredefinedRoles = (namespaceId: string) => {
  return [
    {
      id: uuidv4(),
      namespaceId,
      name: "Admin",
      slug: NamespaceMembershipRole.Admin,
      permissions: namespaceAdminPermissions,
      description: "Full administrative access over a namespace",
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      namespaceId,
      name: "Developer",
      slug: NamespaceMembershipRole.Member,
      permissions: namespaceMemberPermissions,
      description: "Limited read/write role in a namespace",
      createdAt: new Date(),
      updatedAt: new Date()
    },

    {
      id: uuidv4(),
      namespaceId,
      name: "No Access",
      slug: NamespaceMembershipRole.NoAccess,
      permissions: namespaceNoAccessPermissions,
      description: "No access to any resources in the namespace",
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
};
