import type * as Real from "../../src/ee/services/pam-session-recording/aws-s3/aws-s3-provider-factory";
import { AwsS3RecordingStorageProvider as realProvider } from "../../src/ee/services/pam-session-recording/aws-s3/aws-s3-provider-factory";
import { createS3Bucket } from "./s3";

export * from "../../src/ee/services/pam-session-recording/aws-s3/aws-s3-provider-factory";
export const AwsS3RecordingStorageProvider: typeof Real.AwsS3RecordingStorageProvider = () => ({
  ...realProvider(),
  validateConfig: async ({ config }) => {
    if (!config.bucket?.startsWith("pam-web-")) return realProvider().validateConfig({ config });
    const bucket = createS3Bucket({
      bucket: config.bucket!,
      region: config.region!,
      credentials: config.awsCredentials!
    });
    const check = await bucket.checkListAccess();
    if (!check.ok) throw new Error("Fixture recording bucket cannot be listed");
    const write = await bucket.writeTestObject(`${config.keyPrefix ?? ""}/_probe/config`);
    if (!write.ok) throw new Error("Fixture recording bucket is not writable");
  }
});
