import { RawRule } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { AccessScope, TemporaryPermissionMode } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";

import { TMembershipDALFactory } from "../membership/membership-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TAdditionalPrivilegeDALFactory } from "./additional-privilege-dal";
import {
  TAdditionalPrivilegesScopeFactory,
  TCreateAdditionalPrivilegesDTO,
  TDeleteAdditionalPrivilegesDTO,
  TGetAdditionalPrivilegesByIdDTO,
  TGetAdditionalPrivilegesByNameDTO,
  TListAdditionalPrivilegesDTO,
  TUpdateAdditionalPrivilegesDTO
} from "./additional-privilege-types";
import { newNamespaceAdditionalPrivilegesFactory } from "./namespace/namespace-additional-privilege-factory";
import { newOrgAdditionalPrivilegesFactory } from "./org/org-additional-privilege-factory";
import { newProjectAdditionalPrivilegesFactory } from "./project/project-additional-privilege-factory";

type TAdditionalPrivilegeServiceFactoryDep = {
  additionalPrivilegeDAL: TAdditionalPrivilegeDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
};

export type TAdditionalPrivilegeServiceFactory = ReturnType<typeof additionalPrivilegeServiceFactory>;

export const additionalPrivilegeServiceFactory = ({
  additionalPrivilegeDAL,
  permissionService,
  orgDAL,
  membershipDAL
}: TAdditionalPrivilegeServiceFactoryDep) => {
  const scopeFactory: Record<AccessScope, TAdditionalPrivilegesScopeFactory> = {
    [AccessScope.Organization]: newOrgAdditionalPrivilegesFactory({}),
    [AccessScope.Project]: newProjectAdditionalPrivilegesFactory({
      membershipDAL,
      orgDAL,
      permissionService
    }),
    [AccessScope.Namespace]: newNamespaceAdditionalPrivilegesFactory({})
  };

  const createAdditionalPrivilege = async (dto: TCreateAdditionalPrivilegesDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];
    const { membershipId } = await factory.onCreateAdditionalPrivilegesGuard(dto);

    const existingSlug = await additionalPrivilegeDAL.findOne({
      name: data.name,
      membershipId
    });
    if (existingSlug) throw new BadRequestError({ message: `Additional privilege with name ${data.name} exist` });

    validateHandlebarTemplate("Additional Privilege Create", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    if (!data.isTemporary) {
      const additionalPrivilege = await additionalPrivilegeDAL.create({
        membershipId,
        name: data.name,
        isTemporary: data.isTemporary,
        permissions: JSON.stringify(packRules(data.permissions as RawRule[]))
      });

      return {
        additionalPrivilege: { ...additionalPrivilege, permissions: unpackPermissions(additionalPrivilege.permissions) }
      };
    }

    if (!data.temporaryAccessStartTime || !data.temporaryRange) {
      throw new BadRequestError({ message: "Temporary mode expects start time and range" });
    }

    const relativeTempAllocatedTimeInMs = ms(data.temporaryRange);
    const additionalPrivilege = await additionalPrivilegeDAL.create({
      membershipId,
      name: data.name,
      isTemporary: data.isTemporary,
      permissions: data.permissions,
      temporaryAccessEndTime: new Date(
        new Date(data.temporaryAccessStartTime).getTime() + relativeTempAllocatedTimeInMs
      ),
      temporaryAccessStartTime: new Date(data.temporaryAccessStartTime),
      temporaryMode: TemporaryPermissionMode.Relative,
      temporaryRange: data.temporaryRange
    });

    return {
      additionalPrivilege: { ...additionalPrivilege, permissions: unpackPermissions(additionalPrivilege.permissions) }
    };
  };

  const updateAdditionalPrivilege = async (dto: TUpdateAdditionalPrivilegesDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];
    const { membershipId } = await factory.onUpdateAdditionalPrivilegesGuard(dto);

    const existingPrivilege = await additionalPrivilegeDAL.findOne({
      id: dto.selector.id,
      membershipId
    });
    if (!existingPrivilege)
      throw new NotFoundError({ message: `Additional privilege with name ${data.name} doesn't exist` });

    validateHandlebarTemplate("Additional Privilege Create", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity.")
    });

    const updatedData = { ...existingPrivilege, ...data };

    if (!updatedData.isTemporary) {
      const additionalPrivilege = await additionalPrivilegeDAL.updateById(existingPrivilege.id, {
        name: updatedData.name,
        isTemporary: data.isTemporary,
        permissions: data.permissions ? JSON.stringify(packRules(data.permissions as RawRule[])) : undefined
      });

      return {
        additionalPrivilege: { ...additionalPrivilege, permissions: unpackPermissions(additionalPrivilege.permissions) }
      };
    }

    if (!updatedData.temporaryAccessStartTime || !updatedData.temporaryRange) {
      throw new BadRequestError({ message: "Temporary mode expects start time and range" });
    }

    const relativeTempAllocatedTimeInMs = ms(updatedData.temporaryRange);
    const additionalPrivilege = await additionalPrivilegeDAL.create({
      membershipId,
      name: updatedData.name,
      isTemporary: updatedData.isTemporary,
      permissions: updatedData.permissions,
      temporaryAccessEndTime: new Date(
        new Date(updatedData.temporaryAccessStartTime).getTime() + relativeTempAllocatedTimeInMs
      ),
      temporaryAccessStartTime: new Date(updatedData.temporaryAccessStartTime),
      temporaryMode: TemporaryPermissionMode.Relative,
      temporaryRange: updatedData.temporaryRange
    });

    return {
      additionalPrivilege: { ...additionalPrivilege, permissions: unpackPermissions(additionalPrivilege.permissions) }
    };
  };

  const deleteAdditionalPrivilege = async (dto: TDeleteAdditionalPrivilegesDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];
    const { membershipId } = await factory.onDeleteAdditionalPrivilegesGuard(dto);

    const existingPrivilege = await additionalPrivilegeDAL.findOne({
      id: selector.id,
      membershipId
    });
    if (!existingPrivilege)
      throw new NotFoundError({ message: `Additional privilege with id ${selector.id} doesn't exist` });

    const additionalPrivilege = await additionalPrivilegeDAL.deleteById(existingPrivilege.id);
    return {
      additionalPrivilege: { ...additionalPrivilege, permissions: unpackPermissions(additionalPrivilege.permissions) }
    };
  };

  const getAdditionalPrivilegeById = async (dto: TGetAdditionalPrivilegesByIdDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];
    const { membershipId } = await factory.onGetAdditionalPrivilegesByIdGuard(dto);
    const additionalPrivilege = await additionalPrivilegeDAL.findOne({
      id: selector.id,
      membershipId
    });
    if (!additionalPrivilege)
      throw new NotFoundError({ message: `Additional privilege with id ${selector.id} doesn't exist` });

    return {
      additionalPrivilege: { ...additionalPrivilege, permissions: unpackPermissions(additionalPrivilege.permissions) }
    };
  };

  const getAdditionalPrivilegeByName = async (dto: TGetAdditionalPrivilegesByNameDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];
    const { membershipId } = await factory.onGetAdditionalPrivilegesByIdGuard(dto);
    const additionalPrivilege = await additionalPrivilegeDAL.findOne({
      name: selector.name,
      membershipId
    });
    if (!additionalPrivilege)
      throw new NotFoundError({ message: `Additional privilege with name ${selector.name} doesn't exist` });

    return {
      additionalPrivilege: { ...additionalPrivilege, permissions: unpackPermissions(additionalPrivilege.permissions) }
    };
  };

  const listAdditionalPrivileges = async (dto: TListAdditionalPrivilegesDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    const { membershipId } = await factory.onListAdditionalPrivilegesGuard(dto);
    const additionalPrivileges = await additionalPrivilegeDAL.find({
      membershipId
    });

    return {
      additionalPrivileges: additionalPrivileges.map((el) => ({
        ...el,
        permissions: unpackPermissions(el.permissions)
      }))
    };
  };

  return {
    createAdditionalPrivilege,
    updateAdditionalPrivilege,
    deleteAdditionalPrivilege,
    getAdditionalPrivilegeById,
    getAdditionalPrivilegeByName,
    listAdditionalPrivileges
  };
};
