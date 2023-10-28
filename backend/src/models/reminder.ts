import { Schema, Types, model } from "mongoose";

export interface TReminder {
  _id: Types.ObjectId;
  frequency: number;
  note: string;
  secret: Types.ObjectId;
  lastEmailSent: Date;
}

const reminderSchema = new Schema<TReminder>(
  {
    frequency: {
      type: Number,
      required: true
    },
    note: {
      type: String,
      required: true
    },
    secret: {
      type: Schema.Types.ObjectId,
      ref: "Secret",
      required: true
    },
    lastEmailSent: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

export const Reminder = model<TReminder>("Reminder", reminderSchema);
