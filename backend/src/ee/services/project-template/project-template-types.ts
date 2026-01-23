import { z } from "zod";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas/models";
import { TProjectEnvironments } from "@app/db/schemas/project-environments";
import { TProjectPermissionV2Schema } from "@app/ee/services/permission/project-permission";
import { ProjectServiceActor } from "@app/lib/types";
import { UnpackedPermissionSchema } from "@app/server/routes/sanitizedSchema/permission";

export type TProjectTemplateEnvironment = Pick<TProjectEnvironments, "name" | "slug" | "position">;

export type TProjectTemplateRole = {
  slug: string;
  name: string;
  permissions: TProjectPermissionV2Schema[];
};

export type TProjectTemplateUser = {
  username: string;
  roles: string[]; // role slugs
};

export type TProjectTemplateGroup = {
  groupSlug: string;
  roles: string[]; // role slugs
};

export type TCreateProjectTemplateDTO = {
  name: string;
  type: ProjectType;
  description?: string;
  roles: TProjectTemplateRole[];
  environments?: TProjectTemplateEnvironment[] | null;
  users?: TProjectTemplateUser[] | null;
  groups?: TProjectTemplateGroup[] | null;
};

export type TUpdateProjectTemplateDTO = Partial<Omit<TCreateProjectTemplateDTO, "users">> & {
  users?: TProjectTemplateUser[] | null;
};

export type TUnpackedPermission = z.infer<typeof UnpackedPermissionSchema>;

export enum InfisicalProjectTemplate {
  Default = "default"
}

export type TProjectTemplateServiceFactory = {
  listProjectTemplatesByOrg: (
    actor: ProjectServiceActor,
    type?: ProjectType
  ) => Promise<
    (
      | {
          id: string;
          name: InfisicalProjectTemplate;
          type: string;
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
          users: TProjectTemplateUser[] | null;
          groups: TProjectTemplateGroup[] | null;
          orgId: string;
        }
      | {
          environments: TProjectTemplateEnvironment[];
          type: string;
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
          users: TProjectTemplateUser[] | null;
          groups: TProjectTemplateGroup[] | null;
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
    actor: ProjectServiceActor
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
    users: TProjectTemplateUser[] | null;
    groups: TProjectTemplateGroup[] | null;
    name: string;
    orgId: string;
    type: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  updateProjectTemplateById: (
    id: string,
    { roles, environments, ...params }: TUpdateProjectTemplateDTO,
    actor: ProjectServiceActor
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
    users: TProjectTemplateUser[] | null;
    groups: TProjectTemplateGroup[] | null;
    name: string;
    orgId: string;
    id: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  deleteProjectTemplateById: (
    id: string,
    actor: ProjectServiceActor
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
    users: TProjectTemplateUser[] | null;
    groups: TProjectTemplateGroup[] | null;
    name: string;
    orgId: string;
    id: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  findProjectTemplateById: (
    id: string,
    actor: ProjectServiceActor
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
    users: TProjectTemplateUser[] | null;
    groups: TProjectTemplateGroup[] | null;
    name: string;
    orgId: string;
    type: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
  findProjectTemplateByName: (
    name: string,
    actor: ProjectServiceActor
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
    users: TProjectTemplateUser[] | null;
    groups: TProjectTemplateGroup[] | null;
    name: string;
    type: string;
    orgId: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    description?: string | null | undefined;
  }>;
};
