import { Schema, Types, model } from "mongoose";
import { ActorType, EventType, UserAgentType } from "./enums";
import { Actor, Event } from "./types";

export interface IAuditLog {
  actor: Actor;
  organization: Types.ObjectId;
  workspace: Types.ObjectId;
  ipAddress: string;
  event: Event;
  userAgent: string;
  userAgentType: UserAgentType;
  expiresAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: {
      type: {
        type: String,
        enum: ActorType,
        required: true
      },
      metadata: {
        type: Schema.Types.Mixed
      }
    },
    organization: {
      type: Schema.Types.ObjectId,
      required: false
    },
    workspace: {
      type: Schema.Types.ObjectId,
      required: false,
      index: true
    },
    ipAddress: {
      type: String,
      required: true
    },
    event: {
      type: {
        type: String,
        enum: EventType,
        required: true
      },
      metadata: {
        type: Schema.Types.Mixed
      }
    },
    userAgent: {
      type: String,
      required: true
    },
    userAgentType: {
      type: String,
      enum: UserAgentType,
      required: true
    },
    expiresAt: {
      type: Date,
      expires: 0
    }
  },
  {
    timestamps: true
  }
);

export const AuditLog = model<IAuditLog>("AuditLog", auditLogSchema);
