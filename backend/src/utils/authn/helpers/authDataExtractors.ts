import { AuthData } from "../../../interfaces/middleware";
import {
  Identity,
  ServiceTokenData,
  User
} from "../../../models";

/**
 * Returns an object containing the id of the authentication data payload
 * @param {AuthData} authData - authentication data object
 * @returns 
 */
 export const getAuthDataPayloadIdObj = (authData: AuthData) => {
    if (authData.authPayload instanceof User) {
        return { userId: authData.authPayload._id };
    }
  
    if (authData.authPayload instanceof ServiceTokenData) {
        return { serviceTokenDataId: authData.authPayload._id };
    }
  
    if (authData.authPayload instanceof Identity) {
        return { serviceTokenDataId: authData.authPayload._id };
    }
};
  
/**
 * Returns an object containing the user associated with the authentication data payload
 * @param {AuthData} authData - authentication data object
 * @returns 
 */
export const getAuthDataPayloadUserObj = (authData: AuthData) => {
    if (authData.authPayload instanceof User) {
        return { user: authData.authPayload._id };
    }

    if (authData.authPayload instanceof ServiceTokenData) {
        return { user: authData.authPayload.user };
    }

    if (authData.authPayload instanceof Identity) {
        return {};
    }
}