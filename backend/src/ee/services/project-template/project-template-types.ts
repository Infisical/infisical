import { z } from "zod";

import { ProjectMembershipRole, TProjectEnvironments } from "@app/db/schemas";
import { TProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { OrgServiceActor } from "@app/lib/types";
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
  roles: TProjectTemplateRole[];
  environments?: TProjectTemplateEnvironment[] | null;
};

export type TUpdateProjectTemplateDTO = Partial<TCreateProjectTemplateDTO>;

export type TUnpackedPermission = z.infer<typeof UnpackedPermissionSchema>;

export enum InfisicalProjectTemplate {
  Default = "default"
}

export type TProjectTemplateServiceFactory = {
  listProjectTemplatesByOrg: (actor: OrgServiceActor) => Promise<
    (
      | {
          id: string;
          name: InfisicalProjectTemplate;
          createdAt: Date;
          updatedAt: Date;
          description: string;
          environments:
            | {
                name: string;
                slug: string;
                position: number;
              }[]
            | null;
          roles: {
            name: string;
            slug: ProjectMembershipRole;
            permissions: {
              action: string[];
              subject?: string | undefined;
              conditions?: unknown;
              inverted?: boolean | undefined;
            }[];
          }[];
          orgId: string;
        }
      | {
          environments: TProjectTemplateEnvironment[];
          roles: {
            permissions: {
              action: string[];
              subject?: string | undefined;
              conditions?: unknown;
              inverted?: boolean | undefined;
            }[];
            slug: string;
            name: string;
          }[];
          name: string;
          orgId: string;
          id: string;
          createdAt: Date;
          updatedAt: Date;
          description?: string | null | undefined;
        }
    )[]
  >;
  createProjectTemplate: (
    arg: TCreateProjectTemplateDTO,
    actor: OrgServiceActor
  ) => Promise<{
    environments: TProjectTemplateEnvironment[];
    roles: {
      permissions: {
        action: string[];
        subject?: string | undefined;
        conditions?: unknown;
        inverted?: boolean | undefined;
      }[];
      slug: string;
      name: string;
    }[];
    name: string;
    orgId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  updateProjectTemplateById: (
    id: string,
    { roles, environments, ...params }: TUpdateProjectTemplateDTO,
    actor: OrgServiceActor
  ) => Promise<{
    environments: TProjectTemplateEnvironment[];
    roles: {
      permissions: {
        action: string[];
        subject?: string | undefined;
        conditions?: unknown;
        inverted?: boolean | undefined;
      }[];
      slug: string;
      name: string;
    }[];
    name: string;
    orgId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  deleteProjectTemplateById: (
    id: string,
    actor: OrgServiceActor
  ) => Promise<{
    environments: TProjectTemplateEnvironment[];
    roles: {
      permissions: {
        action: string[];
        subject?: string | undefined;
        conditions?: unknown;
        inverted?: boolean | undefined;
      }[];
      slug: string;
      name: string;
    }[];
    name: string;
    orgId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  findProjectTemplateById: (
    id: string,
    actor: OrgServiceActor
  ) => Promise<{
    packedRoles: TProjectTemplateRole[];
    environments: TProjectTemplateEnvironment[];
    roles: {
      permissions: {
        action: string[];
        subject?: string | undefined;
        conditions?: unknown;
        inverted?: boolean | undefined;
      }[];
      slug: string;
      name: string;
    }[];
    name: string;
    orgId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  findProjectTemplateByName: (
    name: string,
    actor: OrgServiceActor
  ) => Promise<{
    packedRoles: TProjectTemplateRole[];
    environments: TProjectTemplateEnvironment[];
    roles: {
      permissions: {
        action: string[];
        subject?: string | undefined;
        conditions?: unknown;
        inverted?: boolean | undefined;
      }[];
      slug: string;
      name: string;
    }[];
    name: string;
    orgId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
};
