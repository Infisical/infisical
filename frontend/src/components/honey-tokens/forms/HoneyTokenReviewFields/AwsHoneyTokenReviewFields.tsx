import { useFormContext } from "react-hook-form";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import { THoneyTokenForm } from "../schemas";
import { HoneyTokenReviewSection } from "./HoneyTokenReviewSection";

export const AwsHoneyTokenReviewFields = () => {
  const { watch } = useFormContext<THoneyTokenForm & { type: HoneyTokenType.AWS }>();

  const { accessKeyId, secretAccessKey } = watch("secretsMapping");

  return (
    <HoneyTokenReviewSection label="Secret Mapping">
      <Detail>
        <DetailLabel>Access Key ID</DetailLabel>
        <DetailValue>{accessKeyId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Secret Access Key</DetailLabel>
        <DetailValue>{secretAccessKey}</DetailValue>
      </Detail>
    </HoneyTokenReviewSection>
  );
};
