import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, TOrganizations, TSecretSharing } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionSecretShareAction, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { OrgServiceActor, SecretSharingAccessType } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TOrgDALFactory } from "../org/org-dal";
import { TSecretShareBrandConfig } from "../org/org-types";
import { TOrgAssetDALFactory } from "../org-asset/org-asset-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TSecretSharingDALFactory } from "./secret-sharing-dal";
import {
  SecretSharingType,
  TCreatePublicSharedSecretDTO,
  TCreateSecretRequestDTO,
  TCreateSharedSecretDTO,
  TDeleteSharedSecretDTO,
  TGetActiveSharedSecretByIdDTO,
  TGetSecretRequestByIdDTO,
  TGetSharedSecretsDTO,
  TRevealSecretRequestValueDTO,
  TSetSecretRequestValueDTO
} from "./secret-sharing-types";

type TSecretSharingServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  secretSharingDAL: TSecretSharingDALFactory;
  orgAssetDAL: TOrgAssetDALFactory;
  orgDAL: TOrgDALFactory;
  userDAL: TUserDALFactory;
  kmsService: TKmsServiceFactory;
  smtpService: TSmtpService;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSecretSharingServiceFactory = ReturnType<typeof secretSharingServiceFactory>;

const mapIdentifierToId = (sharedSecret: TSecretSharing): Omit<TSecretSharing, "identifier"> => {
  // secret requests don't use identifiers and are fully ID dependant. so for secret requests we just return it as-is
  if (sharedSecret.type === SecretSharingType.Request) {
    return sharedSecret;
  }

  const { identifier, ...rest } = sharedSecret;

  if (!identifier) {
    throw new BadRequestError({
      message: `Shared secret created at ${sharedSecret.createdAt.toISOString()} has no identifier`
    });
  }

  return {
    ...rest,
    id: Buffer.from(identifier, "hex").toString("base64url")
  };
};

export const secretSharingServiceFactory = ({
  permissionService,
  secretSharingDAL,
  orgAssetDAL,
  orgDAL,
  kmsService,
  smtpService,
  userDAL,
  licenseService
}: TSecretSharingServiceFactoryDep) => {
  const $validateSharedSecretExpiry = (expiresAt: Date) => {
    if (expiresAt < new Date()) {
      throw new BadRequestError({ message: "Expiration date cannot be in the past" });
    }

    // Limit Expiry Time to 1 month
    const expiryTime = expiresAt.getTime();
    const currentTime = new Date().getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (expiryTime - currentTime > thirtyDays) {
      throw new BadRequestError({ message: "Expiration date cannot be more than 30 days" });
    }

    const fiveMins = 5 * 60 * 1000;

    // 1 second buffer
    if (expiryTime - currentTime + 1000 < fiveMins) {
      throw new BadRequestError({ message: "Expiration time cannot be less than 5 mins" });
    }
  };

  const createSharedSecret = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    secretValue,
    name,
    password,
    accessType,
    expiresIn,
    maxViews,
    authorizedEmails
  }: TCreateSharedSecretDTO) => {
    const appCfg = getConfig();

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    const expiresAt = new Date(Date.now() + ms(expiresIn));

    $validateSharedSecretExpiry(expiresAt);

    const rootOrg = await orgDAL.findRootOrgDetails(orgId);
    if (!rootOrg) throw new BadRequestError({ message: `Organization with id  ${orgId} not found` });

    if (!rootOrg.allowSecretSharingOutsideOrganization && accessType === SecretSharingAccessType.Anyone) {
      throw new BadRequestError({
        message: "Organization does not allow sharing secrets to members outside of this organization"
      });
    }

    if (secretValue.length > 10_000) {
      throw new BadRequestError({ message: "Shared secret value is too long" });
    }

    // Check lifetime is within org allowance
    const lifetime = expiresAt.getTime() - new Date().getTime();

    // rootOrg.maxSharedSecretLifetime is in seconds
    if (rootOrg.maxSharedSecretLifetime && lifetime / 1000 > rootOrg.maxSharedSecretLifetime) {
      throw new BadRequestError({ message: "Secret lifetime exceeds organization limit" });
    }

    // Check max view count is within org allowance
    if (rootOrg.maxSharedSecretViewLimit && (!maxViews || maxViews > rootOrg.maxSharedSecretViewLimit)) {
      throw new BadRequestError({ message: "Secret max views parameter exceeds organization limit" });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();

    const orgEmails = [];

    if (authorizedEmails && authorizedEmails.length > 0) {
      const allOrgMembers = await orgDAL.findAllOrgMembers(orgId);

      // Check to see that all emails are a part of the organization (if enforced) while also collecting a list of emails which are in the org
      for (const email of authorizedEmails) {
        if (allOrgMembers.some((v) => v.user.email === email)) {
          orgEmails.push(email);
          // If the email is not part of the org, but access type / org settings require it
        } else if (
          !rootOrg.allowSecretSharingOutsideOrganization ||
          accessType === SecretSharingAccessType.Organization
        ) {
          throw new BadRequestError({
            message: "Organization does not allow sharing secrets to members outside of this organization"
          });
        }
      }
    }

    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const id = crypto.randomBytes(32).toString("hex");
    const hashedPassword = password ? await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS) : null;

    const newSharedSecret = await secretSharingDAL.create({
      identifier: id,
      iv: null,
      tag: null,
      encryptedValue: null,
      encryptedSecret,
      name,
      type: SecretSharingType.Share,
      password: hashedPassword,
      expiresAt: new Date(expiresAt),
      expiresAfterViews: maxViews,
      ...(actor === ActorType.USER && { userId: actorId }),
      ...(actor === ActorType.IDENTITY && { identityId: actorId }),
      orgId,
      accessType,
      authorizedEmails: authorizedEmails && authorizedEmails.length > 0 ? JSON.stringify(authorizedEmails) : undefined
    });

    const mappedSharedSecret = mapIdentifierToId(newSharedSecret);

    // Loop through recipients and send out emails with unique access links
    if (authorizedEmails) {
      const user = await userDAL.findById(actorId);

      if (!user) {
        throw new NotFoundError({ message: `User with ID '${actorId}' not found` });
      }

      for await (const email of authorizedEmails) {
        try {
          // Only show the username to emails which are part of the organization
          const respondentUsername = orgEmails.includes(email) ? user.username : undefined;

          await smtpService.sendMail({
            recipients: [email],
            subjectLine: "A secret has been shared with you",
            substitutions: {
              name,
              respondentUsername,
              secretRequestUrl: `${appCfg.SITE_URL}/shared/secret/${mappedSharedSecret.id}`
            },
            template: SmtpTemplates.SecretRequestCompleted
          });
        } catch (e) {
          logger.error(e, "Failed to send shared secret URL to a recipient's email.");
        }
      }
    }

    return {
      ...mappedSharedSecret,
      sharedSecretLink: `${appCfg.SITE_URL}/shared/secret/${mappedSharedSecret.id}`
    };
  };

  const createSecretRequest = async ({
    actor,
    accessType,
    expiresIn,
    name,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TCreateSecretRequestDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    const expiresAt = new Date(Date.now() + ms(expiresIn));

    $validateSharedSecretExpiry(expiresAt);

    const newSecretRequest = await secretSharingDAL.create({
      type: SecretSharingType.Request,
      userId: actorId,
      orgId,
      name,
      encryptedSecret: null,
      accessType,
      expiresAt
    });

    return { id: newSecretRequest.id };
  };

  const revealSecretRequestValue = async ({
    id,
    actor,
    actorId,
    actorOrgId,
    orgId,
    actorAuthMethod
  }: TRevealSecretRequestValueDTO) => {
    const secretRequest = await secretSharingDAL.getSecretRequestById(id);

    if (!secretRequest) {
      throw new NotFoundError({ message: `Secret request with ID '${id}' not found` });
    }

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

    if (secretRequest.userId !== actorId || secretRequest.orgId !== orgId) {
      throw new ForbiddenRequestError({ name: "User does not have permission to access this secret request" });
    }

    if (!secretRequest.encryptedSecret) {
      throw new BadRequestError({ message: "Secret request has no value set" });
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();
    const decryptedSecret = decryptWithRoot(secretRequest.encryptedSecret);

    return { ...secretRequest, secretValue: decryptedSecret.toString() };
  };

  const getSecretRequestById = async ({
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSecretRequestByIdDTO) => {
    const secretRequest = await secretSharingDAL.getSecretRequestById(id);

    if (!secretRequest) {
      throw new NotFoundError({ message: `Secret request with ID '${id}' not found` });
    }

    if (secretRequest.accessType === SecretSharingAccessType.Organization) {
      if (!secretRequest.orgId) {
        throw new BadRequestError({ message: "No organization ID present on secret request" });
      }

      if (!actorOrgId) {
        throw new UnauthorizedError();
      }

      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: secretRequest.orgId,
        actorAuthMethod,
        actorOrgId
      });
      if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });
    }

    if (secretRequest.expiresAt && secretRequest.expiresAt < new Date()) {
      return {
        requestOrgId: secretRequest.orgId,
        error: "Secret request has expired",
        isSecretValueSet: false
      };
    }

    return {
      request: secretRequest,
      requestOrgId: secretRequest.orgId,
      isSecretValueSet: Boolean(secretRequest.encryptedSecret)
    };
  };

  const getSecretRequestOrgId = async (secretRequestId: string) => {
    const secretRequest = await secretSharingDAL.getSecretRequestById(secretRequestId);
    return secretRequest?.orgId ?? null;
  };

  const setSecretRequestValue = async ({
    id,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    secretValue
  }: TSetSecretRequestValueDTO) => {
    const appCfg = getConfig();

    const secretRequest = await secretSharingDAL.getSecretRequestById(id);

    if (!secretRequest) {
      throw new NotFoundError({ message: `Secret request with ID '${id}' not found` });
    }

    let respondentUsername: string | undefined;

    if (secretRequest.accessType === SecretSharingAccessType.Organization) {
      if (!secretRequest.orgId) {
        throw new BadRequestError({ message: "No organization ID present on secret request" });
      }

      if (!actorOrgId) {
        throw new UnauthorizedError();
      }

      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: secretRequest.orgId,
        actorAuthMethod,
        actorOrgId
      });
      if (!permission) throw new ForbiddenRequestError({ name: "User is not a part of the specified organization" });

      const user = await userDAL.findById(actorId);

      if (!user) {
        throw new NotFoundError({ message: `User with ID '${actorId}' not found` });
      }

      respondentUsername = user.username;
    }

    if (secretRequest.encryptedSecret) {
      throw new BadRequestError({ message: "Secret request already has a value set" });
    }

    if (secretValue.length > 10_000) {
      throw new BadRequestError({ message: "Shared secret value is too long" });
    }

    if (secretRequest.expiresAt && secretRequest.expiresAt < new Date()) {
      throw new ForbiddenRequestError({
        message: "Access denied: Secret request has expired"
      });
    }

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const request = await secretSharingDAL.transaction(async (tx) => {
      const updatedRequest = await secretSharingDAL.updateById(id, { encryptedSecret }, tx);

      await smtpService.sendMail({
        recipients: [secretRequest.requesterUsername],
        subjectLine: "Secret Request Completed",
        substitutions: {
          name: secretRequest.name,
          respondentUsername,
          secretRequestUrl: `${appCfg.SITE_URL}/organizations/${secretRequest.orgId}/secret-sharing?selectedTab=request-secret`
        },
        template: SmtpTemplates.SecretRequestCompleted
      });

      return updatedRequest;
    });

    return request;
  };

  const createPublicSharedSecret = async ({
    password,
    secretValue,
    expiresIn,
    maxViews,
    accessType
  }: TCreatePublicSharedSecretDTO) => {
    const expiresAt = new Date(Date.now() + ms(expiresIn));

    $validateSharedSecretExpiry(expiresAt);

    const encryptWithRoot = kmsService.encryptWithRootKey();
    const encryptedSecret = encryptWithRoot(Buffer.from(secretValue));

    const appCfg = getConfig();

    const id = crypto.randomBytes(32).toString("hex");
    const hashedPassword = password ? await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS) : null;

    const newSharedSecret = await secretSharingDAL.create({
      identifier: id,
      encryptedValue: null,
      iv: null,
      tag: null,
      type: SecretSharingType.Share,
      encryptedSecret,
      password: hashedPassword,
      expiresAt,
      expiresAfterViews: maxViews,
      accessType
    });

    return mapIdentifierToId(newSharedSecret);
  };

  const getSharedSecrets = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    offset,
    limit,
    type
  }: TGetSharedSecretsDTO) => {
    if (!actorOrgId) throw new ForbiddenRequestError();

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    const secrets = await secretSharingDAL.find(
      {
        ...(actor === ActorType.USER && { userId: actorId }),
        ...(actor === ActorType.IDENTITY && { identityId: actorId }),
        orgId: actorOrgId,
        type
      },
      { offset, limit, sort: [["createdAt", "desc"]] }
    );

    const count = await secretSharingDAL.countAllUserOrgSharedSecrets({
      orgId: actorOrgId,
      type,
      ...(actor === ActorType.USER && { userId: actorId }),
      ...(actor === ActorType.IDENTITY && { identityId: actorId })
    });

    return {
      secrets: secrets.map(mapIdentifierToId),
      totalCount: count
    };
  };

  const getSharedSecretById = async (sharedSecretId: string, orgId?: string, actorId?: string) => {
    const sharedSecret = await secretSharingDAL.findOne({
      type: SecretSharingType.Share,
      identifier: Buffer.from(sharedSecretId, "base64url").toString("hex")
    });

    if (!sharedSecret) {
      throw new NotFoundError({ message: `Shared secret with ID '${sharedSecretId}' not found` });
    }

    const { expiresAt, expiresAfterViews, accessType } = sharedSecret;

    // Auth check for org-restricted secrets
    if (accessType === SecretSharingAccessType.Organization) {
      if (!orgId) {
        throw new UnauthorizedError({ message: "Authentication required to view this secret" });
      }
      if (sharedSecret.orgId && sharedSecret.orgId !== orgId) {
        throw new ForbiddenRequestError({ message: "You do not have access to this secret" });
      }
    }

    // Check if secret is expired
    if (expiresAt !== null && expiresAt < new Date()) {
      await secretSharingDAL.softDeleteById(sharedSecret.id);
      throw new NotFoundError({ message: "The shared secret has expired" });
    }

    // Check if view limit reached
    if (expiresAfterViews !== null && expiresAfterViews === 0) {
      await secretSharingDAL.softDeleteById(sharedSecret.id);
      throw new NotFoundError({ message: "The shared secret has reached its view limit" });
    }

    // Check authorized emails if set
    if (sharedSecret.authorizedEmails && (sharedSecret.authorizedEmails as string[]).length > 0) {
      if (!actorId) {
        throw new UnauthorizedError({ message: "Authentication required to view this secret" });
      }

      const user = await userDAL.findById(actorId);
      if (!user || !user.email) {
        throw new UnauthorizedError({ message: "Authentication required to view this secret" });
      }

      if (!(sharedSecret.authorizedEmails as string[]).includes(user.email)) {
        throw new ForbiddenRequestError({ message: "You are not authorized to view this secret" });
      }
    }

    return {
      ...mapIdentifierToId(sharedSecret),
      isPasswordProtected: Boolean(sharedSecret.password)
    };
  };

  const $decrementSecretViewCount = async (sharedSecret: TSecretSharing) => {
    const { expiresAfterViews } = sharedSecret;

    if (expiresAfterViews) {
      // decrement view count if view count expiry set
      await secretSharingDAL.updateById(sharedSecret.id, { $decr: { expiresAfterViews: 1 } });
    }

    await secretSharingDAL.updateById(sharedSecret.id, {
      lastViewedAt: new Date()
    });
  };

  /** Gets password-less secret. validates all secret's requested (must be fresh). */
  const accessSharedSecret = async ({ sharedSecretId, orgId, actorId, password }: TGetActiveSharedSecretByIdDTO) => {
    const sharedSecret = await secretSharingDAL.findOne({
      type: SecretSharingType.Share,
      identifier: Buffer.from(sharedSecretId, "base64url").toString("hex")
    });

    if (!sharedSecret) {
      throw new NotFoundError({
        message: `Shared secret with ID '${sharedSecretId}' not found`
      });
    }

    const { accessType, expiresAt, expiresAfterViews } = sharedSecret;

    if (accessType === SecretSharingAccessType.Organization && orgId === undefined) {
      throw new UnauthorizedError();
    }

    if (accessType === SecretSharingAccessType.Organization && orgId !== sharedSecret.orgId) {
      throw new ForbiddenRequestError();
    }

    // If the secret was shared with specific emails, verify that the current user's session email is authorized
    if (sharedSecret.authorizedEmails && (sharedSecret.authorizedEmails as string[]).length > 0) {
      if (!actorId) throw new UnauthorizedError();

      const user = await userDAL.findById(actorId);
      if (!user || !user.email) throw new UnauthorizedError();

      if (!(sharedSecret.authorizedEmails as string[]).includes(user.email))
        throw new ForbiddenRequestError({ message: "You are not authorized to view this secret" });
    }

    // all secrets pass through here, meaning we check if its expired first and then check if it needs verification
    // or can be safely sent to the client.
    if (expiresAt !== null && expiresAt < new Date()) {
      // check lifetime expiry
      await secretSharingDAL.softDeleteById(sharedSecret.id);
      throw new NotFoundError({ message: "The shared secret has expired" });
    }

    if (expiresAfterViews !== null && expiresAfterViews === 0) {
      // check view count expiry
      await secretSharingDAL.softDeleteById(sharedSecret.id);
      throw new NotFoundError({ message: "The shared secret has reached its view limit" });
    }

    // Password checks
    const isPasswordProtected = Boolean(sharedSecret.password);
    const hasProvidedPassword = Boolean(password);
    if (isPasswordProtected) {
      if (hasProvidedPassword) {
        const isMatch = await crypto.hashing().compareHash(password as string, sharedSecret.password as string);
        if (!isMatch) {
          throw new UnauthorizedError({ message: "Invalid credentials" });
        }
      } else {
        throw new UnauthorizedError({ message: "Password is required to access this secret" });
      }
    }

    const decryptWithRoot = kmsService.decryptWithRootKey();

    if (!sharedSecret.encryptedSecret) {
      throw new BadRequestError({ message: "Secret has no value specified" });
    }
    const decryptedSecretValue = decryptWithRoot(sharedSecret.encryptedSecret);

    let organization: TOrganizations | undefined;

    if (
      sharedSecret.orgId &&
      sharedSecret.orgId === orgId &&
      sharedSecret.accessType === SecretSharingAccessType.Organization
    ) {
      organization = await orgDAL.findOrgById(sharedSecret.orgId);
    }

    // decrement when we are sure the user will view secret.
    await $decrementSecretViewCount(sharedSecret);

    return {
      ...mapIdentifierToId(sharedSecret),
      secretValue: decryptedSecretValue.toString(),
      orgName: organization?.name
    };
  };

  const deleteSharedSecretById = async (deleteSharedSecretInput: TDeleteSharedSecretDTO) => {
    const { actor, actorId, orgId, actorAuthMethod, actorOrgId, sharedSecretId } = deleteSharedSecretInput;
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    if (!permission) throw new ForbiddenRequestError({ name: "User does not belong to the specified organization" });

    let sharedSecret;

    if (deleteSharedSecretInput.type === SecretSharingType.Request) {
      sharedSecret = await secretSharingDAL.findOne({
        id: sharedSecretId
      });
    } else {
      sharedSecret = await secretSharingDAL.findOne({
        identifier: Buffer.from(sharedSecretId, "base64url").toString("hex")
      });
    }

    if (!sharedSecret) {
      throw new NotFoundError({ message: `Shared secret with ID '${sharedSecretId}' not found` });
    }

    if (actor === ActorType.USER) {
      if (sharedSecret.userId !== actorId) {
        throw new ForbiddenRequestError({
          message: "User does not have permission to delete shared secret"
        });
      }
    } else if (actor === ActorType.IDENTITY) {
      if (sharedSecret.identityId !== actorId) {
        throw new ForbiddenRequestError({
          message: "Identity does not have permission to delete shared secret"
        });
      }
    } else {
      throw new ForbiddenRequestError({ message: "User does not have permission to delete shared secret" });
    }

    if (sharedSecret.orgId && sharedSecret.orgId !== orgId) {
      throw new ForbiddenRequestError({ message: "User does not have permission to delete shared secret" });
    }

    const deletedSharedSecret = await secretSharingDAL.deleteById(sharedSecret.id);

    return mapIdentifierToId(deletedSharedSecret);
  };

  const getSharedSecretOrgId = async (sharedSecretId: string) => {
    const sharedSecret = await secretSharingDAL.findOne({
      identifier: Buffer.from(sharedSecretId, "base64url").toString("hex"),
      type: SecretSharingType.Share
    });

    return sharedSecret?.orgId ?? null;
  };

  const getOrgBrandConfig = async (orgId: string, actor?: OrgServiceActor) => {
    // When accessed via public endpoint (from shared secret), don't check permission
    if (actor) {
      const { permission } = await permissionService.getOrgPermission({
        actor: actor.type,
        actorId: actor.id,
        orgId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        scope: OrganizationActionScope.ParentOrganization
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionSecretShareAction.ManageSettings,
        OrgPermissionSubjects.SecretShare
      );
    }

    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretShareExternalBranding) {
      return null;
    }

    const org = await orgDAL.findOrgById(orgId);
    const assets = await orgAssetDAL.listAssetsByType(orgId, ["brand-logo", "brand-favicon"]);

    const hasLogo = assets.some((a) => a.assetType === "brand-logo");
    const hasFavicon = assets.some((a) => a.assetType === "brand-favicon");

    const config = org?.secretShareBrandConfig as TSecretShareBrandConfig;

    if (!config && !hasLogo && !hasFavicon) {
      return null;
    }

    return {
      hasLogo,
      hasFavicon,
      primaryColor: config?.primaryColor,
      secondaryColor: config?.secondaryColor
    };
  };

  const getBrandingAsset = async (orgId: string, assetType: string, actor?: OrgServiceActor) => {
    // When accessed via public endpoint (from shared secret), don't check permission
    if (actor) {
      const { permission } = await permissionService.getOrgPermission({
        actor: actor.type,
        actorId: actor.id,
        orgId,
        actorAuthMethod: actor.authMethod,
        actorOrgId: actor.orgId,
        scope: OrganizationActionScope.ParentOrganization
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionSecretShareAction.ManageSettings,
        OrgPermissionSubjects.SecretShare
      );
    }

    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretShareExternalBranding) {
      return null;
    }

    const asset = await orgAssetDAL.getFirstAsset(orgId, assetType);
    return asset;
  };

  const uploadBrandingAsset = async (
    orgId: string,
    assetType: string,
    data: Buffer,
    contentType: string,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretShareAction.ManageSettings,
      OrgPermissionSubjects.SecretShare
    );

    const size = data.length;
    return orgAssetDAL.upsertFirstAsset(orgId, assetType, data, contentType, size);
  };

  const deleteBrandingAsset = async (orgId: string, assetType: string, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretShareAction.ManageSettings,
      OrgPermissionSubjects.SecretShare
    );

    await orgAssetDAL.deleteAssetsByType(orgId, assetType);
  };

  return {
    createSharedSecret,
    createPublicSharedSecret,
    getSharedSecrets,
    deleteSharedSecretById,
    getSharedSecretById,
    accessSharedSecret,
    getSharedSecretOrgId,
    getOrgBrandConfig,
    getBrandingAsset,
    uploadBrandingAsset,
    deleteBrandingAsset,
    createSecretRequest,
    getSecretRequestById,
    getSecretRequestOrgId,
    setSecretRequestValue,
    revealSecretRequestValue
  };
};
