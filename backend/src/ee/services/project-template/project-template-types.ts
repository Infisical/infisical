import { z } from "zod";

import { ProjectType, TProjectEnvironments } from "@app/db/schemas";
import { TProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { UnpackedPermissionSchema } from "@app/server/routes/sanitizedSchema/permission";

export type TProjectTemplateEnvironment = Pick<TProjectEnvironments, "name" | "slug" | "position">;

export type TProjectTemplateRole = {
  slug: string;
  name: string;
  permissions: TProjectPermissionV2Schema[];
};

export type TCreateProjectTemplateDTO = {
  name: string;
  description?: string;
  type: ProjectType;
  roles: TProjectTemplateRole[];
  environments?: TProjectTemplateEnvironment[] | null;
};

export type TUpdateProjectTemplateDTO = Partial<TCreateProjectTemplateDTO>;

export type TUnpackedPermission = z.infer<typeof UnpackedPermissionSchema>;

export enum InfisicalProjectTemplate {
  Default = "default"
}
