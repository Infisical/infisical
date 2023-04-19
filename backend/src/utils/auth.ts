import { AuthData } from '../interfaces/middleware';
import {
    User,
    ServiceAccount,
    ServiceTokenData,
    ServiceToken
} from '../models';

// TODO: find a more optimal folder structure to store these types of functions

/**
 * Returns an object containing the id of the authentication data payload
 * @param {AuthData} authData - authentication data object
 * @returns 
 */
const getAuthDataPayloadIdObj = (authData: AuthData) => {
    if (authData.authPayload instanceof User) {
        return { userId: authData.authPayload._id };
    }

    if (authData.authPayload instanceof ServiceAccount) {
        return { serviceAccountId: authData.authPayload._id };
    }

    if (authData.authPayload instanceof ServiceTokenData) {
        return { serviceTokenDataId: authData.authPayload._id };
    }
};


/**
 * Returns an object containing the user associated with the authentication data payload
 * @param {AuthData} authData - authentication data object
 * @returns 
 */
const getAuthDataPayloadUserObj = (authData: AuthData) => {

    if (authData.authPayload instanceof User) {
        return { user: authData.authPayload._id };
    }

    if (authData.authPayload instanceof ServiceAccount) {
        return { user: authData.authPayload.user };
    }

    if (authData.authPayload instanceof ServiceTokenData) {
        return { user: authData.authPayload.user };
    }
}

export {
    getAuthDataPayloadIdObj,
    getAuthDataPayloadUserObj
}