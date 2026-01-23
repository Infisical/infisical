import { ProjectUserAdditionalPrivilegeSchema } from "@app/db/schemas/project-user-additional-privilege";

import { UnpackedPermissionSchema } from "./permission";

export const SanitizedUserProjectAdditionalPrivilegeSchema = ProjectUserAdditionalPrivilegeSchema.extend({
  permissions: UnpackedPermissionSchema.array()
});
