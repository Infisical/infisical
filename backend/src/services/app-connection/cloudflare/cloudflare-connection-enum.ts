export enum CloudflareConnectionMethod {
  APIToken = "api-token"
}

/**
 * The storage jurisdiction of an R2 bucket. It is part of the bucket's identity: the bucket's token
 * policy resource key is `com.cloudflare.edge.r2.bucket.<accountId>_<jurisdiction>_<bucketName>`, and
 * the same bucket name can exist in more than one jurisdiction.
 */
export enum CloudflareR2Jurisdiction {
  Default = "default",
  Eu = "eu",
  FedRamp = "fedramp"
}
