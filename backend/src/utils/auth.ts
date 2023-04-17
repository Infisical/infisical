import { AuthData } from '../interfaces/middleware';
import {
    User,
    ServiceAccount,
    ServiceTokenData
} from '../models';

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

    return {};
};

export {
    getAuthDataPayloadIdObj
}