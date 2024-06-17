import jwt from "jsonwebtoken";

import { OrgMembershipRole, OrgMembershipStatus, TableName, TUsers } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

import { AuthMethod, AuthTokenType } from "../auth/auth-type";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TOrgMembershipDALFactory } from "../org-membership/org-membership-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { normalizeUsername } from "../user/user-fns";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { UserAliasType } from "../user-alias/user-alias-types";
import { TOidcLoginDTO } from "./oidc-config-types";

type TOidcConfigServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "create" | "findOne" | "transaction" | "updateById" | "findById">;
  userAliasDAL: Pick<TUserAliasDALFactory, "create" | "findOne">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "create">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TOidcConfigServiceFactory = ReturnType<typeof oidcConfigServiceFactory>;

export const oidcConfigServiceFactory = ({
  orgDAL,
  orgMembershipDAL,
  userDAL,
  userAliasDAL,
  licenseService,
  tokenService,
  smtpService
}: TOidcConfigServiceFactoryDep) => {
  const oidcLogin = async ({ externalId, email, firstName, lastName, orgId }: TOidcLoginDTO) => {
    const appCfg = getConfig();
    const userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType: UserAliasType.OIDC
    });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new BadRequestError({ message: "Org not found" });

    let user: TUsers;
    if (userAlias) {
      user = await userDAL.transaction(async (tx) => {
        const foundUser = await userDAL.findById(userAlias.userId, tx);
        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: foundUser.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );
        if (!orgMembership) {
          await orgMembershipDAL.create(
            {
              userId: userAlias.userId,
              inviteEmail: email,
              orgId,
              role: OrgMembershipRole.Member,
              status: foundUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
            },
            tx
          );
          // Only update the membership to Accepted if the user account is already completed.
        } else if (orgMembership.status === OrgMembershipStatus.Invited && foundUser.isAccepted) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }

        return foundUser;
      });
    } else {
      user = await userDAL.transaction(async (tx) => {
        let newUser: TUsers | undefined;
        if (!newUser) {
          const uniqueUsername = await normalizeUsername(externalId, userDAL);
          newUser = await userDAL.create(
            {
              email,
              firstName,
              isEmailVerified: false,
              username: uniqueUsername,
              lastName,
              authMethods: [],
              isGhost: false
            },
            tx
          );
        }

        await userAliasDAL.create(
          {
            userId: newUser.id,
            aliasType: UserAliasType.OIDC,
            externalId,
            emails: email ? [email] : [],
            orgId
          },
          tx
        );

        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: newUser.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );

        if (!orgMembership) {
          await orgMembershipDAL.create(
            {
              userId: newUser.id,
              inviteEmail: email,
              orgId,
              role: OrgMembershipRole.Member,
              status: newUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
            },
            tx
          );
          // Only update the membership to Accepted if the user account is already completed.
        } else if (orgMembership.status === OrgMembershipStatus.Invited && newUser.isAccepted) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }

        return newUser;
      });
    }
    await licenseService.updateSubscriptionOrgMemberCount(organization.id);

    const isUserCompleted = Boolean(user.isAccepted);
    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
        ...(user.email && { email: user.email, isEmailVerified: user.isEmailVerified }),
        firstName,
        lastName,
        organizationName: organization.name,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        authMethod: AuthMethod.OIDC,
        authType: UserAliasType.OIDC,
        isUserCompleted
      },
      appCfg.AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_PROVIDER_AUTH_LIFETIME
      }
    );

    // TODO: Sheen update oidc config
    // await samlConfigDAL.update({ orgId }, { lastUsed: new Date() });

    if (user.email && !user.isEmailVerified) {
      const token = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_VERIFICATION,
        userId: user.id
      });

      await smtpService.sendMail({
        template: SmtpTemplates.EmailVerification,
        subjectLine: "Infisical confirmation code",
        recipients: [user.email],
        substitutions: {
          code: token
        }
      });
    }

    return { isUserCompleted, providerAuthToken };
  };

  return { oidcLogin };
};
