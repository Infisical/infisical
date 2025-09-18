import { ForbiddenError, subject } from "@casl/ability";

import { NamespaceMembershipRole } from "@app/db/schemas";
import {
  NamespacePermissionIdentityActions,
  NamespacePermissionSubjects
} from "@app/ee/services/permission/namespace-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";

import { TIdentityOrgDALFactory } from "../../../services/identity/identity-org-dal";
import { TNamespaceDALFactory } from "../namespace/namespace-dal";
import { TNamespaceMembershipRoleDALFactory } from "../namespace-role/namespace-membership-role-dal";
import { TNamespaceRoleDALFactory } from "../namespace-role/namespace-role-dal";
import { NamespaceUserMembershipTemporaryMode } from "../namespace-user-membership/namespace-user-membership-types";
import { TIdentityNamespaceMembershipDALFactory } from "./identity-namespace-membership-dal";
import {
  TCreateIdentityNamespaceMembershipDTO,
  TDeleteIdentityNameespaceMembershipDTO,
  TGetIdentityNameespaceMembershipByIdentityIdDTO,
  TListIdentityNameespaceMembershipDTO,
  TUpdateIdentityNameespaceMembershipDTO
} from "./identity-namespace-membership-types";

type TIdentityNamespaceMembershipServiceFactoryDep = {
  identityNamespaceMembershipDAL: TIdentityNamespaceMembershipDALFactory;
  namespaceMembershipRoleDAL: Pick<
    TNamespaceMembershipRoleDALFactory,
    "create" | "transaction" | "insertMany" | "delete"
  >;
  namespaceDAL: Pick<TNamespaceDALFactory, "findOne">;
  namespaceRoleDAL: Pick<TNamespaceRoleDALFactory, "find">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getNamespacePermission" | "getNamespacePermissionByRole">;
};

export type TIdentityNamespaceMembershipServiceFactory = ReturnType<typeof identityNamespaceMembershipServiceFactory>;

// TODO(namespace): check all deletes are correct
// TODO(namespace): check shouldUseNewPrivilege thingy
export const identityNamespaceMembershipServiceFactory = ({
  identityNamespaceMembershipDAL,
  permissionService,
  identityOrgMembershipDAL,
  namespaceMembershipRoleDAL,
  namespaceDAL,
  namespaceRoleDAL
}: TIdentityNamespaceMembershipServiceFactoryDep) => {
  const createIdentityNamespaceMembership = async ({
    identityId,
    roles,
    permission
  }: TCreateIdentityNamespaceMembershipDTO) => {
    const { namespaceSlug } = permission;
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.actorOrgId });
    if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceSlug} not found` });

    const { permission: namespacePermission, membership } = await permissionService.getNamespacePermission({
      actor: permission.actor,
      actorAuthMethod: permission.actorAuthMethod,
      actorId: permission.actorId,
      actorOrgId: permission.actorOrgId,
      namespaceId: namespace.id
    });

    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionIdentityActions.Create,
      subject(NamespacePermissionSubjects.Identity, {
        identityId
      })
    );

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId,
      orgId: namespace.orgId
    });

    if (!identityOrgMembership)
      throw new NotFoundError({
        message: `Failed to find identity with ID ${identityId}`
      });

    const existingIdentity = await identityNamespaceMembershipDAL.findOne({
      orgIdentityMembershipId: identityOrgMembership.id,
      namespaceId: namespace.id
    });

    if (existingIdentity)
      throw new BadRequestError({
        message: `Identity with ID ${identityId} already exists in namespace`
      });

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getNamespacePermissionByRole(
        requestedRoleChange,
        namespace.id
      );

      if (requestedRoleChange !== NamespaceMembershipRole.NoAccess) {
        const permissionBoundary = validatePrivilegeChangeOperation(
          membership.shouldUseNewPrivilegeSystem,
          NamespacePermissionIdentityActions.GrantPrivileges,
          NamespacePermissionSubjects.Identity,
          namespacePermission,
          rolePermission
        );
        if (!permissionBoundary.isValid)
          throw new PermissionBoundaryError({
            message: constructPermissionErrorMessage(
              "Failed to assign to role",
              membership.shouldUseNewPrivilegeSystem,
              NamespacePermissionIdentityActions.GrantPrivileges,
              NamespacePermissionSubjects.Identity
            ),
            details: { missingPermissions: permissionBoundary.missingPermissions }
          });
      }
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) => !Object.values(NamespaceMembershipRole).includes(role as NamespaceMembershipRole)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    const customRoles = hasCustomRole
      ? await namespaceRoleDAL.find({
          namespaceId: namespace.id,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length)
      throw new NotFoundError({ message: "One or more custom namespace roles not found" });

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);
    const namespaceIdentity = await identityNamespaceMembershipDAL.transaction(async (tx) => {
      const identityNamespaceMembership = await identityNamespaceMembershipDAL.create(
        {
          orgIdentityMembershipId: identityOrgMembership.id,
          namespaceId: namespace.id
        },
        tx
      );
      const sanitizedNamespaceMembershipRoles = roles.map((inputRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
        if (!inputRole.isTemporary) {
          return {
            namespaceMembershipId: identityNamespaceMembership.id,
            role: isCustomRole ? NamespaceMembershipRole.Custom : inputRole.role,
            customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null
          };
        }

        // check cron or relative here later for now its just relative
        const relativeTimeInMs = ms(inputRole.temporaryRange);
        return {
          namespaceMembershipId: identityNamespaceMembership.id,
          role: isCustomRole ? NamespaceMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
          isTemporary: true,
          temporaryMode: NamespaceUserMembershipTemporaryMode.Relative,
          temporaryRange: inputRole.temporaryRange,
          temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
          temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
        };
      });

      const identityRoles = await namespaceMembershipRoleDAL.insertMany(sanitizedNamespaceMembershipRoles, tx);
      return { ...identityNamespaceMembership, roles: identityRoles };
    });

    return namespaceIdentity;
  };

  const updateIdentityNamespaceMembership = async ({
    identityId,
    roles,
    permission
  }: TUpdateIdentityNameespaceMembershipDTO) => {
    const { namespaceSlug } = permission;
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.actorOrgId });
    if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceSlug} not found` });

    const { permission: namespacePermission, membership } = await permissionService.getNamespacePermission({
      actor: permission.actor,
      actorAuthMethod: permission.actorAuthMethod,
      actorId: permission.actorId,
      actorOrgId: permission.actorOrgId,
      namespaceId: namespace.id
    });
    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionIdentityActions.Edit,
      subject(NamespacePermissionSubjects.Identity, { identityId })
    );

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId,
      orgId: namespace.orgId
    });

    if (!identityOrgMembership)
      throw new NotFoundError({
        message: `Failed to find identity with ID ${identityId}`
      });

    const namespaceIdentity = await identityNamespaceMembershipDAL.findOne({
      orgIdentityMembershipId: identityOrgMembership.id,
      namespaceId: namespace.id
    });

    if (!namespaceIdentity)
      throw new NotFoundError({
        message: `Identity with ID ${identityId} doesn't exist in namespace`
      });

    for await (const { role: requestedRoleChange } of roles) {
      const { permission: rolePermission } = await permissionService.getNamespacePermissionByRole(
        requestedRoleChange,
        namespace.id
      );

      const permissionBoundary = validatePrivilegeChangeOperation(
        membership.shouldUseNewPrivilegeSystem,
        NamespacePermissionIdentityActions.GrantPrivileges,
        NamespacePermissionSubjects.Identity,
        namespacePermission,
        rolePermission
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to change role",
            membership.shouldUseNewPrivilegeSystem,
            NamespacePermissionIdentityActions.GrantPrivileges,
            NamespacePermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) =>
        !Object.values(NamespaceMembershipRole)
          // we don't want to include custom in this check;
          // this unintentionally enables setting slug to custom which is reserved
          .filter((r) => r !== NamespaceMembershipRole.Custom)
          .includes(role as NamespaceMembershipRole.Member)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    const customRoles = hasCustomRole
      ? await namespaceRoleDAL.find({
          namespaceId: namespace.id,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length)
      throw new NotFoundError({ message: "One or more custom namespace roles not found" });

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const sanitizedNamespaceMembershipRoles = roles.map((inputRole) => {
      const isCustomRole = Boolean(customRolesGroupBySlug?.[inputRole.role]?.[0]);
      if (!inputRole.isTemporary) {
        return {
          namespaceMembershipId: namespaceIdentity.id,
          role: isCustomRole ? NamespaceMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null
        };
      }

      // check cron or relative here later for now its just relative
      const relativeTimeInMs = ms(inputRole.temporaryRange);
      return {
        namespaceMembershipId: namespaceIdentity.id,
        role: isCustomRole ? NamespaceMembershipRole.Custom : inputRole.role,
        customRoleId: customRolesGroupBySlug[inputRole.role] ? customRolesGroupBySlug[inputRole.role][0].id : null,
        isTemporary: true,
        temporaryMode: NamespaceUserMembershipTemporaryMode.Relative,
        temporaryRange: inputRole.temporaryRange,
        temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
        temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
      };
    });

    const updatedRoles = await namespaceMembershipRoleDAL.transaction(async (tx) => {
      await namespaceMembershipRoleDAL.delete({ namespaceMembershipId: namespaceIdentity.id }, tx);
      return namespaceMembershipRoleDAL.insertMany(sanitizedNamespaceMembershipRoles, tx);
    });

    return updatedRoles;
  };

  const deleteIdentityNamespaceMembership = async ({
    identityId,
    permission
  }: TDeleteIdentityNameespaceMembershipDTO) => {
    const { namespaceSlug } = permission;
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.actorOrgId });
    if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceSlug} not found` });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.actor,
      actorAuthMethod: permission.actorAuthMethod,
      actorId: permission.actorId,
      actorOrgId: permission.actorOrgId,
      namespaceId: namespace.id
    });

    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionIdentityActions.Delete,
      subject(NamespacePermissionSubjects.Identity, { identityId })
    );

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId,
      orgId: namespace.orgId
    });

    if (!identityOrgMembership)
      throw new NotFoundError({
        message: `Failed to find identity with ID ${identityId}`
      });

    const identityNamespaceMembership = await identityNamespaceMembershipDAL.findOne({
      orgIdentityMembershipId: identityOrgMembership.id,
      namespaceId: namespace.id
    });
    if (!identityNamespaceMembership) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    }

    const [deletedIdentity] = await identityNamespaceMembershipDAL.delete({
      orgIdentityMembershipId: identityId,
      namespaceId: namespace.id
    });
    return deletedIdentity;
  };

  const listIdentityNamespaceMemberships = async ({
    limit,
    offset,
    orderBy,
    orderDirection,
    search,
    permission
  }: TListIdentityNameespaceMembershipDTO) => {
    const { namespaceSlug } = permission;
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.actorOrgId });
    if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceSlug} not found` });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.actor,
      actorAuthMethod: permission.actorAuthMethod,
      actorId: permission.actorId,
      actorOrgId: permission.actorOrgId,
      namespaceId: namespace.id
    });
    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionIdentityActions.Read,
      NamespacePermissionSubjects.Identity
    );

    const identityMemberships = await identityNamespaceMembershipDAL.findByNamespaceId(namespace.id, {
      limit,
      offset,
      orderBy,
      orderDirection,
      search
    });

    const totalCount = await identityNamespaceMembershipDAL.getCountByNamespaceId(namespace.id, { search });

    return { identityMemberships, totalCount };
  };

  const getIdentityNamespaceMembershipByIdentityId = async ({
    identityId,
    permission
  }: TGetIdentityNameespaceMembershipByIdentityIdDTO) => {
    const { namespaceSlug } = permission;
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.actorOrgId });
    if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceSlug} not found` });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.actor,
      actorAuthMethod: permission.actorAuthMethod,
      actorId: permission.actorId,
      actorOrgId: permission.actorOrgId,
      namespaceId: namespace.id
    });

    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionIdentityActions.Read,
      subject(NamespacePermissionSubjects.Identity, { identityId })
    );

    const [identityMembership] = await identityNamespaceMembershipDAL.findByNamespaceId(namespace.id, {
      identityId
    });
    if (!identityMembership)
      throw new NotFoundError({
        message: `Namespace membership for identity with ID '${identityId}' in namespace not found`
      });

    return identityMembership;
  };

  return {
    createIdentityNamespaceMembership,
    updateIdentityNamespaceMembership,
    deleteIdentityNamespaceMembership,
    listIdentityNamespaceMemberships,
    getIdentityNamespaceMembershipByIdentityId
  };
};
