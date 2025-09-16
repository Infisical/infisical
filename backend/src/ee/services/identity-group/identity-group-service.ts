import slugify from "@sindresorhus/slugify";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { ForbiddenError } from "@casl/ability";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TIdentityGroupDALFactory } from "./identity-group-dal";
import { TCreateIdentityGroupDTO } from "./identity-group-types";

type TIdentityGroupServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "find" | "findOne">;
  identityGroupDAL: TIdentityGroupDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityGroupServiceFactory = ReturnType<typeof identityGroupServiceFactory>;

export const identityGroupServiceFactory = ({
  identityDAL,
  identityGroupDAL,
  permissionService,
  licenseService
}: TIdentityGroupServiceFactoryDep) => {
  const createGroup = async ({ name, slug, role, actor, actorId, actorAuthMethod, actorOrgId }: TCreateIdentityGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );
    // TODO: the permission is now reusing the one for group, but we should have a new one for the identity group
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Create, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create group due to plan restriction. Upgrade plan to create group."
      });

    // TODO: there was legacy code for old permission system. we removed it here to simplify the code
    //       should take a second look at it and see if we really need it here

    const identityGroup = await identityGroupDAL.transaction(async (tx) => {
      const existingGroup = await identityGroupDAL.findOne({ orgId: actorOrgId, name }, tx);
      if (existingGroup) {
        throw new BadRequestError({
          message: `Failed to create identity group with name '${name}'. Identity group with the same name already exists`
        });
      }

      const newGroup = await identityGroupDAL.create(
        {
          name,
          slug: slug || slugify(`${name}-${alphaNumericNanoId(4)}`),
          orgId: actorOrgId,
          role: role,
        },
        tx
      );

      return newGroup;
    });

    return identityGroup;
  };

  return { createGroup };
};
