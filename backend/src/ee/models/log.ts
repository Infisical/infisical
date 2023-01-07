import { Schema, model, Types } from 'mongoose';
import {
    ACTION_ADD_SECRETS,
    ACTION_UPDATE_SECRETS,
    ACTION_READ_SECRETS,
    ACTION_DELETE_SECRETS
} from '../../variables';

export interface ILog {
    _id: Types.ObjectId;
    user?: Types.ObjectId;
    workspace?: Types.ObjectId;
    actionNames: string[];
    actions: Types.ObjectId[];
    channel: string;
    ipAddress?: string;
}

const logSchema = new Schema<ILog>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        workspace: {
            type: Schema.Types.ObjectId,
            ref: 'Workspace'
        },
        actionNames: {
            type: [String],
            enum: [
                ACTION_ADD_SECRETS,
                ACTION_UPDATE_SECRETS,
                ACTION_READ_SECRETS,
                ACTION_DELETE_SECRETS
            ],
            required: true
        },
        actions: [{
            type: Schema.Types.ObjectId,
            ref: 'Action',
            required: true
        }],
        channel: { 
            type: String,
            enum: ['web', 'cli', 'auto'],
            required: true
        },
        ipAddress: {
            type: String
        }
    }, {
        timestamps: true
    }
);

const Log = model<ILog>('Log', logSchema);

export default Log;