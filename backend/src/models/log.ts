import { Schema, model, Types } from 'mongoose';

export interface ILog {
    _id: Types.ObjectId;
    user?: Types.ObjectId;
    workspace: Types.ObjectId;
    event: string;
    groupId: string;
    payload: {
        numberofSecrets?: number;
        environment?: string;
    },
    channel: string;
    ipAddress?: string;
}

// log group consists of logs (each log is associated with 1 event)
// scenario:

// do we in the future record old and new values for secrets? (when you log update secret,
// do you want to know what the old secret value was changed to?)

// Option 1:

// action 1: pushed secrets (top-level event)
// - log 1 (groupId: ABC): modified 10 secrets (sub-level event)
// ---- array of secret ids that were modified
// - log 2 (groupId: ABC): deleted 5 secrets
// ---- array of secret ids that were deleted
// - log 3 (groupId: ABC): created 10 secrets
// ---- array of secret ids that were created

// action 2: pull secrets
// - log 4 (groupId: DEF): read 20 secrets
// ---- array of secret ids that were read

// Option 2 (many logs):

// action 1: pushed secrets (top-level event)
// - log 1 (groupId: ABC): modified secret abc
// - log 2 (groupId: ABC): modified secret def
// - log 3 (groupId: ABC): modified secret ghi
// - log 4 (groupId: ABC): created secret jkl
// - log 5 (groupId: ABC): created secret mno
// - log 6 (groupId: ABC): deleted secret pqr

// action 2: pull secrets (pulling 100 secrets = 100 logs; 10 times per day, 5 people => 5000 logs)
// - log 7 (groupId: DEF): read secret abc
// - log 8 (groupId: DEF): read secret def
// - log 9 (groupId: DEF): read secret ghi
// - log 10 (groupId: DEF): read secret jkl
// - log 11 (groupId: DEF): read secret mno

// logGroup
// ---- log (query for log groups by person and by secret etc.)

/**
 * Action: save secrets
 * - 
 * 
 */

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
        event: { // CRUD secrets
            type: String,
            required: true
        },
        groupId: {
            type: String,
            required: true,
        },
        payload: { 
            secrets: [{
                type: Schema.Types.ObjectId,
                ref: 'Secret'
            }]
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