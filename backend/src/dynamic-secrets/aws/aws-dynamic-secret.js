import AWS from 'aws-sdk'

export const createTemporaryIAMUser = async (rootAccessKeyId, rootSecretAccessKey, region, userName, policyDocument, durationInSeconds) => {
  // Configure AWS SDK with your root user credentials
  AWS.config.update({
    accessKeyId: rootAccessKeyId,
    secretAccessKey: rootSecretAccessKey,
    region: region,
  });

  const iam = new AWS.IAM();
  const sts = new AWS.STS();
  // Get the account ID
  const callerIdentity = await sts.getCallerIdentity().promise();
  const accountId = callerIdentity.Account;

  // Create the IAM role
  const roleName = `Role-${userName}`;
  const assumeRolePolicyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          AWS: `arn:aws:iam::${accountId}:root`,
        },
        Action: 'sts:AssumeRole',
      },
    ],
  };
  const createRoleParams = {
    RoleName: roleName,
    AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
  };
  const role = await iam.createRole(createRoleParams).promise();

  // Create and attach the policy to the IAM role
  const policyName = `Policy-${userName}`;
  const createPolicyParams = {
    PolicyName: policyName,
    PolicyDocument: JSON.stringify(policyDocument),
  };
  const policy = await iam.createPolicy(createPolicyParams).promise();

  const attachRolePolicyParams = {
    PolicyArn: policy.Policy.Arn,
    RoleName: roleName,
  };
  await iam.attachRolePolicy(attachRolePolicyParams).promise();

  // Create temporary credentials for the IAM role
  const assumeRoleParams = {
    RoleArn: role.Role.Arn,
    RoleSessionName: `TemporarySession-${userName}`,
    DurationSeconds: durationInSeconds,
  };
  const credentials = await sts.assumeRole(assumeRoleParams).promise();

  // Return the temporary credentials
  return {
    accessKeyId: credentials.Credentials.AccessKeyId,
    secretAccessKey: credentials.Credentials.SecretAccessKey,
    sessionToken: credentials.Credentials.SessionToken,
  };
};

// module.exports = createTemporaryIAMUser;






// // Example policy document
// const policyDocument = {
//   Version: '2012-10-17',
//   Statement: [
//     {
//       Action: 's3:ListBucket',
//       Effect: 'Allow',
//       Resource: 'arn:aws:s3:::example-bucket',
//     },
//   ],
// };


