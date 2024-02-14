import jwt from "jsonwebtoken";

import {
  OrgMembershipRole,
  OrgMembershipStatus
} from "@app/db/schemas";
import { TScimDALFactory } from "@app/ee/services/scim/scim-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";        
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TLicenseServiceFactory } from "../license/license-service";
import { getConfig } from "@app/lib/config/env";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import {
  TCreateScimTokenDTO,
  TListScimUsersDTO,
  TListScimUsersRes,
  TCreateScimUserDTO,
  TScimTokenJwtPayload
} from "./scim-types";
import { 
  createScimUser,
  TScimUser,
} from "@app/lib/scim";
import { UnauthorizedError, ScimRequestError } from "@app/lib/errors";

type TScimServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  scimDAL: TScimDALFactory; // TODO: pick
  userDAL: TUserDALFactory; // TODO: pick
  orgDAL: TOrgDALFactory; // TODO: pick
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TScimServiceFactory = ReturnType<typeof scimServiceFactory>;

export const scimServiceFactory = ({ 
  licenseService,
  scimDAL,
  userDAL,
  orgDAL,
  permissionService
}: TScimServiceFactoryDep) => {
  const createScimToken = async ({
    organizationId,
    description,
    ttl
  }: TCreateScimTokenDTO) => {
    const appCfg = getConfig();
    
    // TODO: permission stuff

    const scimTokenData = await scimDAL.create({
      orgId: organizationId,
      description,
      ttl
    });
    
    const scimToken = jwt.sign(
      {
        scimTokenId: scimTokenData.id,
        authTokenType: AuthTokenType.SCIM_TOKEN
      },
      appCfg.AUTH_SECRET
    );
    
    return { scimToken }
  }

  const getScimTokens = async (organizationId: string) => {
    const scimTokens = await scimDAL.find({ orgId: organizationId });
    return scimTokens;
  }
  
  const deleteScimToken = async (scimTokenId: string) => {
    const scimToken = await scimDAL.deleteById(scimTokenId);
    return scimToken;
  }
  
  // scim server endpoints

  const listUsers = async ({
    offset,
    limit,
    filter
  }: TListScimUsersDTO): Promise<TListScimUsersRes> => {
    
    const parseFilter = (filter: string | undefined) => {
      if (!filter) return {};
      const [parsedName, parsedValue] = filter.split("eq").map(s => s.trim());
      
      let attributeName = parsedName;
      if (parsedName === "userName") { // note
        attributeName = "email";
      }
      
      return { [attributeName]: parsedValue };
    };
    
    const findOpts = {
      ...(offset && { offset }),
      ...(limit && { limit }),
    };
    
    const users = await userDAL.find(parseFilter(filter), findOpts);
    
    let resources: TScimUser[] = [];
    
    let scimResource: TListScimUsersRes = { // note: type
      Resources: [],
      itemsPerPage: limit,
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      startIndex: offset,
      totalResults: users.length
    };
    
    users.forEach((user) => {
      let scimUser = createScimUser({
        userId: user.id,
        firstName: user.firstName as string,
        lastName: user.lastName as string,
        email: user.email
      });
      resources.push(scimUser);
    });

    scimResource.Resources = resources;
    
    return scimResource;
  }
  
  const getUser = async (userId: string) => {
    // TODO: check out SCIM-specific errors
    
    let user;
    try {
      user = await userDAL.findById(userId);
    } catch (error) {

      interface PostgresError extends Error {
        error: {
          code: string;
        }
      }
      
      const dbError = error as PostgresError;
      
      if (dbError.error.code === "22P02") throw new ScimRequestError({
        detail: "User not found",
        status: 404
      });
      
      throw error;
    }
    
    if (!user) throw new ScimRequestError({
      detail: "User not found",
      status: 404
    });
    
    return createScimUser({
      userId: user.id,
      firstName: user.firstName as string,
      lastName: user.lastName as string,
      email: user.email
    });
  }
  
  const createUser = async ({
    firstName,
    lastName,
    email,
    orgId
  }: TCreateScimUserDTO) => {
    let user = await userDAL.findOne({
      email
    });
    
    if (user) throw new ScimRequestError({
      detail: "User already exists in the database",
      status: 409
    });

    user = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.create(
        {
          email,
          firstName,
          lastName,
          authMethods: [AuthMethod.EMAIL]
        },
        tx
      );
      await orgDAL.createMembership({
        inviteEmail: email,
        orgId,
        role: OrgMembershipRole.Member,
        status: OrgMembershipStatus.Invited
      });
      return newUser;
    });
    
    return createScimUser({
      userId: user.id,
      firstName: user.firstName as string,
      lastName: user.lastName as string,
      email: user.email
    });
  }
  
  const fnValidateScimToken = async (token: TScimTokenJwtPayload) => {
    // TODO: check expiry
    
    const scimToken = await scimDAL.findById(token.scimTokenId);
    if (!scimToken) throw new UnauthorizedError();
    
    return { scimTokenId: scimToken.id, orgId: scimToken.orgId };
  }
  
  return { 
    createScimToken,
    getScimTokens,
    deleteScimToken,
    listUsers,
    getUser,
    createUser,
    fnValidateScimToken
  };
};
