import { Schema, model, Types } from 'mongoose';

export interface IBotSequence {
	_id: Types.ObjectId;
    bot: Types.ObjectId;
    name: string;
    event: string;
    action: string;
}

const botSequence = new Schema<IBotSequence>(
    {
        bot: {
            type: Schema.Types.ObjectId,
            ref: 'Bot',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        event: {
            type: String,
            required: true
        },
        action: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
);

const BotSequence = model<IBotSequence>('BotSequence', botSequence);

export default BotSequence;