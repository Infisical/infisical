import { Types } from "mongoose";
import { getSymmetricKeyHelper } from "../helpers/botOrg";

// TODO: DOCstrings

class BotOrgService {
    static async getSymmetricKey(organizationId: Types.ObjectId) {
        return await getSymmetricKeyHelper(organizationId);
    }
}

export default BotOrgService;