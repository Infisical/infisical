import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export const useAddAwsExternalKms = () => {
  return useMutation({
    mutationFn: async ({
      slug,
      description,
      credentialType,
      accessKey,
      secretKey,
      assumeRoleArn,
      externalId,
      awsRegion,
      kmsKeyId
    }: {
      slug: string;
      description: string;
      credentialType: string;
      accessKey?: string;
      secretKey?: string;
      assumeRoleArn?: string;
      externalId?: string;
      awsRegion: string;
      kmsKeyId?: string;
    }) => {
      const { data } = await apiRequest.post("/api/v1/external-kms", {
        slug,
        description,
        provider: {
          type: "aws",
          inputs: {
            credential: {
              type: credentialType,
              data: {
                accessKey,
                secretKey,
                assumeRoleArn,
                externalId
              }
            },
            awsRegion,
            kmsKeyId
          }
        }
      });

      return data;
    },
    onSuccess() {}
  });
};
