import { TProjectRole } from "@app/hooks/api/roles/types";

import { ProjectType } from "../workspace/types";

export type TProjectTemplate = {
  id: string;
  name: string;
  description?: string;
  type: ProjectType;
  roles: Pick<TProjectRole, "slug" | "name" | "permissions">[];
  environments?: { name: string; slug: string; position: number }[] | null;
  createdAt: string;
  updatedAt: string;
};

export type TListProjectTemplates = { projectTemplates: TProjectTemplate[] };
export type TProjectTemplateResponse = { projectTemplate: TProjectTemplate };

export type TCreateProjectTemplateDTO = {
  name: string;
  description?: string;
  type?: ProjectType;
};

export type TUpdateProjectTemplateDTO = Partial<
  Pick<TProjectTemplate, "name" | "description" | "roles" | "environments">
> & { templateId: string };

export type TDeleteProjectTemplateDTO = {
  templateId: string;
};

export enum InfisicalProjectTemplate {
  Default = "default"
}
