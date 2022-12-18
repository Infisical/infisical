import { Schema, model, Types } from 'mongoose';

export interface ILog {
    _id: Types.ObjectId;
    user?: Types.ObjectId;
    workspace: Types.ObjectId;
    event: string;
    source: string;
    ipAddress?: string;
}

// TODO: need a way to store payload info for each
// log

// which secret is being ref etc.

// user logged in

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
        event: { // push, pull
            type: String,
            required: true
        },
        payload: { // should this just be a payload attr?
            numberOfSecrets: {
                type: Number
            },
            environment: {
                type: String
            }
        },
        channel: { 
            type: String,
            enum: ['web', 'cli', 'auto'],
            required: true
        },
        ipAddress: { // store in bytes?
            type: String
        }
    }, {
        timestamps: true
    }
);

const Log = model<ILog>('Log', logSchema);

export default Log;