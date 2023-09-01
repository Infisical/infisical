import { Schema, Types, model } from "mongoose";

export interface ITokenData {
  type: string;
  email?: string;
  phoneNumber?: string;
  organization?: Types.ObjectId;
  tokenHash: string;
  triesLeft?: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tokenDataSchema = new Schema<ITokenData>({
  type: {
    type: String,
    enum: [
      "emailConfirmation",
      "emailMfa",
      "organizationInvitation",
      "passwordReset",
    ],
    required: true,
  },
  email: {
    type: String,
  },
  phoneNumber: {
    type: String,
  },
  organization: { // organizationInvitation-specific field
    type: Schema.Types.ObjectId,
    ref: "Organization",
  },
  tokenHash: {
    type: String,
    select: false,
    required: true,
  },
  triesLeft: {
    type: Number,
  },
  expiresAt: {
    type: Date,
    expires: 0,
    required: true,
  },
}, {
  timestamps: true,
});

export const TokenData = model<ITokenData>("TokenData", tokenDataSchema);