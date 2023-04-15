// WIP
import { Types } from 'mongoose';

class SecretService {
    static async createSecretBlindIndex({
        secretName,
        workspaceId,
    }: {
        secretName: string;
        workspaceId: Types.ObjectId;
    }) {
        // TODO
        return;
    }

    static async getSecretBlindIndex({
        secretName,
        workspaceId
    }: {
        secretName: string;
        workspaceId: Types.ObjectId;
    }) {
        // TODO
        return;
    }
}