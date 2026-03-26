import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TUserAuthenticationDALFactory } from "./user-authentication-dal";
import {
  TCreateUserAuthenticationDTO,
  TSwitchUserAuthenticationDTO,
  UserAuthenticationType
} from "./user-authentication-types";

type TUserAuthenticationServiceFactoryDep = {
  userAuthenticationDAL: Pick<
    TUserAuthenticationDALFactory,
    "create" | "findById" | "deleteById" | "findByUserId" | "findByExternalIdAndType"
  >;
};

export type TUserAuthenticationServiceFactory = ReturnType<typeof userAuthenticationServiceFactory>;

export const userAuthenticationServiceFactory = ({ userAuthenticationDAL }: TUserAuthenticationServiceFactoryDep) => {
  const createAuthentication = async (dto: TCreateUserAuthenticationDTO) => {
    const existing = await userAuthenticationDAL.findByUserId(dto.userId);
    if (existing) {
      throw new BadRequestError({
        message: "User already has an authentication record. Use switchAuthentication to change auth method."
      });
    }

    return userAuthenticationDAL.create({
      userId: dto.userId,
      type: dto.type,
      externalId: dto.externalId,
      domain: dto.domain
    });
  };

  const switchAuthentication = async (dto: TSwitchUserAuthenticationDTO) => {
    const existing = await userAuthenticationDAL.findByUserId(dto.userId);
    if (!existing) {
      throw new NotFoundError({
        message: "No authentication record found for user"
      });
    }

    await userAuthenticationDAL.deleteById(existing.id);

    return userAuthenticationDAL.create({
      userId: dto.userId,
      type: dto.type,
      externalId: dto.externalId,
      domain: dto.domain
    });
  };

  const getByUserId = async (userId: string) => {
    return userAuthenticationDAL.findByUserId(userId);
  };

  const getByExternalIdAndType = async (externalId: string, type: UserAuthenticationType) => {
    return userAuthenticationDAL.findByExternalIdAndType(externalId, type);
  };

  return {
    createAuthentication,
    switchAuthentication,
    getByUserId,
    getByExternalIdAndType
  };
};
