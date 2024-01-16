import { Schema, Types, model } from "mongoose";

export interface ISecret {
  _id: Types.ObjectId;
  version: number;
  workspace: Types.ObjectId;
  type: string;
  user?: Types.ObjectId;
  environment: string;
  secretBlindIndex?: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretKeyHash: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretValueHash: string;
  secretCommentCiphertext?: string;
  secretCommentIV?: string;
  secretCommentTag?: string;
  secretCommentHash?: string;

  // ? NOTE: This works great for workspace-level reminders.
  // ? If we want to do it on a user-basis, we should ideally have a seperate model for reminders.
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;

  skipMultilineEncoding?: boolean;
  algorithm: "aes-256-gcm";
  keyEncoding: "utf8" | "base64";
  tags?: string[];
  folder?: string;
  metadata?: {
    [key: string]: string;
  };
}

const secretSchema = new Schema<ISecret>(
  {
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    user: {
      // user associated with the personal secret
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    tags: {
      ref: "Tag",
      type: [Schema.Types.ObjectId],
      default: [],
    },
    environment: {
      type: String,
      required: true,
    },
    secretBlindIndex: {
      type: String,
      
    },
    secretKeyCiphertext: {
      type: String,
      required: true,
    },
    secretKeyIV: {
      type: String, // symmetric
      required: true,
    },
    secretKeyTag: {
      type: String, // symmetric
      required: true,
    },
    secretKeyHash: {
      type: String,
    },
    secretValueCiphertext: {
      type: String,
      required: true,
    },
    secretValueIV: {
      type: String, // symmetric
      required: true,
    },
    secretValueTag: {
      type: String, // symmetric
      required: true,
    },
    secretValueHash: {
      type: String,
    },
    secretCommentCiphertext: {
      type: String,
      required: false,
    },
    secretCommentIV: {
      type: String, // symmetric
      required: false,
    },
    secretCommentTag: {
      type: String, // symmetric
      required: false,
    },
    secretCommentHash: {
      type: String,
      required: false,
    },

    secretReminderRepeatDays: {
      type: Number,
      required: false,
      default: null,
    },
    secretReminderNote: {
      type: String,
      required: false,
      default: null,
    },

    skipMultilineEncoding: {
      type: Boolean,
      required: false,
    },

    algorithm: {
      // the encryption algorithm used
      type: String,
      required: true,
    },
    keyEncoding: {
      type: String,
      required: true,
    },
    folder: {
      type: String,
      default: "root",
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

secretSchema.index({ tags: 1 }, { background: true });

export const Secret = model<ISecret>("Secret", secretSchema);
