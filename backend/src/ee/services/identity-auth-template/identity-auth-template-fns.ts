import { Knex } from "knex";

import { TIdentityAuthTemplates } from "@app/db/schemas/identity-auth-templates";
import { ConflictError, NotFoundError } from "@app/lib/errors";

import { TIdentityAuthTemplateDALFactory } from "./identity-auth-template-dal";

export const assertTemplateUnchangedForLink = async (
  identityAuthTemplateDAL: Pick<TIdentityAuthTemplateDALFactory, "findByIdForShare">,
  template: Pick<TIdentityAuthTemplates, "id" | "name" | "updatedAt">,
  tx: Knex
) => {
  const lockedTemplate = await identityAuthTemplateDAL.findByIdForShare(template.id, tx);
  if (!lockedTemplate) {
    throw new NotFoundError({
      message: `Auth template '${template.name}' was deleted while this request was in progress`
    });
  }
  if (lockedTemplate.updatedAt.getTime() !== template.updatedAt.getTime()) {
    throw new ConflictError({
      message: `Auth template '${template.name}' was modified while this request was in progress. Retry the request.`
    });
  }
};
