import { Types } from 'mongoose';
import { AuthData } from '../../middleware';

export interface CreateSecretParams {
    secretName: string;
    workspaceId: Types.ObjectId;
    environment: string;
    type: 'shared' | 'personal';
    authData: AuthData;
    secretKeyCiphertext: string;
    secretKeyIV: string;
    secretKeyTag: string;
    secretValueCiphertext: string;
    secretValueIV: string;
    secretValueTag: string;
}

export interface GetSecretsParams {
    workspaceId: Types.ObjectId;
    environment: string;
    authData: AuthData;
}

export interface GetSecretParams {
    secretName: string;
    workspaceId: Types.ObjectId;
    environment: string;
    type?: 'shared' | 'personal';
    authData: AuthData;
}

export interface UpdateSecretParams {
    secretName: string;
    workspaceId: Types.ObjectId;
    environment: string;
    type: 'shared' | 'personal',
    authData: AuthData
    secretValueCiphertext: string;
    secretValueIV: string;
    secretValueTag: string;
}

export interface DeleteSecretParams {
    secretName: string;
    workspaceId: Types.ObjectId;
    environment: string;
    type: 'shared' | 'personal';
    authData: AuthData;
}