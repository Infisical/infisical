import { Schema, model } from 'mongoose';
import { EMAIL_TOKEN_LIFETIME } from '../config';

export interface IToken {
  email: string;
  token: string;
  createdAt: Date;
  ttl: Number;
}

const tokenSchema = new Schema<IToken>({
  email: {
    type: String,
    required: true
  },
  token: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  ttl: {
    type: Number,
  }
});

tokenSchema.index({ email: 1 });

const Token = model<IToken>('Token', tokenSchema);

export default Token;
