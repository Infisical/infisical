export const isValidAWSParameterStorePath = (awsStorePath: string) => {
  const pattern = /^\/([\w-]+\/)*[\w-]+\/$/;
  return pattern.test(awsStorePath) && awsStorePath.length <= 2048;
};