import { ProjectType } from "@app/db/schemas";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

export enum ObjectStorageType {
  Default = "default",
  External = "external"
}

export type TStorageConfig =
  | { storageType: ObjectStorageType.Default }
  | {
      storageType: ObjectStorageType.External;
      appConnectionId: string;
      bucket: string;
      region: AWSRegion;
      keyPrefix?: string | null;
      // Picks the external ID the customer's role trusts.
      projectType: ProjectType;
    };

export type TStorageNamespace = {
  id: string;
  product: string;
  path: string;
  // The path's pieces in order: a fixed word, or the name of an id the caller fills in.
  segments: ({ kind: "word"; value: string } | { kind: "id"; name: string })[];
};

export enum ObjectStorageErrorReason {
  Temporary = "temporary",
  AccessDenied = "access-denied",
  BucketNotFound = "bucket-not-found",
  Rejected = "rejected",
  ConnectionInvalid = "connection-invalid",
  Unconfigured = "unconfigured"
}

export type TObjectStorageErrorDetails = {
  bucket?: string;
  region?: string;
  awsErrorCode?: string;
  httpStatus?: number;
  connectionName?: string;
  connectionApp?: string;
  isConnectionMissing?: boolean;
  step?: "list" | "write";
  cause?: string;
};
