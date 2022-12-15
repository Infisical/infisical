import { Schema, model } from 'mongoose';
import { EMAIL_TOKEN_LIFETIME } from '../config';

export interface IToken {
  email: string;
  token: string;
  createdAt: Date;
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
  }
});

tokenSchema.index({ 
  createdAt: 1 
}, { 
  expireAfterSeconds: parseInt(EMAIL_TOKEN_LIFETIME) 
});

const Token = model<IToken>('Token', tokenSchema);

export default Token;
