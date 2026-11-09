export type TAwsPartition = {
  consoleDomain: string;
  defaultRegion: string;
  stsSuffix: string;
  launchSupported: boolean;
  unsupportedUseCases: string[];
  isRegionInPartition: (region: string) => boolean;
};

const NON_COMMERCIAL_REGION_PREFIXES = ["us-gov-", "cn-", "eusc-"];

export const AwsPartition = {
  Commercial: "aws",
  GovCloud: "aws-us-gov",
  China: "aws-cn",
  EuropeanSovereignCloud: "aws-eusc"
} as const;

export const AWS_PARTITIONS: Record<string, TAwsPartition> = {
  [AwsPartition.Commercial]: {
    consoleDomain: "console.aws.amazon.com",
    defaultRegion: "us-east-1",
    stsSuffix: "amazonaws.com",
    launchSupported: true,
    unsupportedUseCases: [],
    isRegionInPartition: (region) => !NON_COMMERCIAL_REGION_PREFIXES.some((prefix) => region.startsWith(prefix))
  },
  [AwsPartition.GovCloud]: {
    consoleDomain: "console.amazonaws-us-gov.com",
    defaultRegion: "us-gov-west-1",
    stsSuffix: "amazonaws.com",
    launchSupported: false,
    unsupportedUseCases: [],
    isRegionInPartition: (region) => region.startsWith("us-gov-")
  },
  [AwsPartition.China]: {
    consoleDomain: "console.amazonaws.cn",
    defaultRegion: "cn-north-1",
    stsSuffix: "amazonaws.com.cn",
    launchSupported: false,
    unsupportedUseCases: [],
    isRegionInPartition: (region) => region.startsWith("cn-")
  },
  [AwsPartition.EuropeanSovereignCloud]: {
    consoleDomain: "console.amazonaws.eu",
    defaultRegion: "eusc-de-east-1",
    stsSuffix: "amazonaws.eu",
    launchSupported: false,
    unsupportedUseCases: [],
    isRegionInPartition: (region) => region.startsWith("eusc-")
  }
};
