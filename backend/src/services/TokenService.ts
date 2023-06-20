import { Types } from "mongoose";
import { createTokenHelper, validateTokenHelper } from "../helpers/token";

/**
 * Class to handle token actions
 * TODO: elaborate more on this class
 */
class TokenService {
    /**
     * Create a token [token] for type [type] with associated details
     * @param {Object} obj
     * @param {String} obj.type - type or context of token (e.g. emailConfirmation)
     * @param {String} obj.email - email associated with the token
     * @param {String} obj.phoneNumber - phone number associated with the token
     * @param {Types.ObjectId} obj.organizationId - id of organization associated with the token
     * @returns {String} token - the token to create
     */
    static async createToken({
        type,
        email,
        phoneNumber,
        organizationId,
    }: {
        type: "emailConfirmation" | "emailMfa" | "organizationInvitation" | "passwordReset";
        email?: string;
        phoneNumber?: string;
        organizationId?: Types.ObjectId;
    }) {
        return await createTokenHelper({
            type,
            email,
            phoneNumber,
            organizationId,
        });
    }
    
    /**
     * Validate whether or not token [token] and its associated details match a token in the DB
     * @param {Object} obj
     * @param {String} obj.type - type or context of token (e.g. emailConfirmation)
     * @param {String} obj.email - email associated with the token
     * @param {String} obj.phoneNumber - phone number associated with the token
     * @param {Types.ObjectId} obj.organizationId - id of organization associated with the token
     * @param {String} obj.token - the token to validate
     */
    static async validateToken({
        type,
        email,
        phoneNumber,
        organizationId,
        token,
    }: {
        type: "emailConfirmation" | "emailMfa" | "organizationInvitation" | "passwordReset";
        email?: string;
        phoneNumber?: string;
        organizationId?: Types.ObjectId;
        token: string;
    }) {
        return await validateTokenHelper({
            type,
            email,
            phoneNumber,
            organizationId,
            token,
        });
    }
}

export default TokenService;