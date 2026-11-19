const KMS_KEY_ID =
  "(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|mrk-[0-9a-f]{32})";
const KMS_ALIAS = "alias/[a-zA-Z0-9/_-]+";

const AWS_KMS_KEY_IDENTIFIER_REGEX = new RegExp(
  `^(?:${KMS_KEY_ID}|${KMS_ALIAS}|arn:aws[a-z-]*:kms:[a-z0-9-]+:\\d{12}:(?:key/${KMS_KEY_ID}|${KMS_ALIAS}))$`
);

export const isAwsKmsKeyIdentifier = (value: string) => AWS_KMS_KEY_IDENTIFIER_REGEX.test(value);
