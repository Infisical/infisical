import { useFormContext } from "react-hook-form";

import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import { THoneyTokenForm } from "../schemas";
import { AwsHoneyTokenReviewFields } from "./AwsHoneyTokenReviewFields";
import { HoneyTokenReviewSection } from "./HoneyTokenReviewSection";

const MAPPING_COMPONENT_MAP: Record<HoneyTokenType, React.FC> = {
  [HoneyTokenType.AWS]: AwsHoneyTokenReviewFields
};

export const HoneyTokenReviewFields = () => {
  const { watch } = useFormContext<THoneyTokenForm>();

  const { type, name, description } = watch();

  const MappingComponent = MAPPING_COMPONENT_MAP[type];
  const tokenDetails = HONEY_TOKEN_MAP[type];

  return (
    <div className="mb-4 flex flex-col gap-6">
      <HoneyTokenReviewSection label="Configuration">
        <Detail>
          <DetailLabel>Type</DetailLabel>
          <DetailValue>{tokenDetails.name}</DetailValue>
        </Detail>
      </HoneyTokenReviewSection>
      <MappingComponent />
      <HoneyTokenReviewSection label="Details">
        <Detail>
          <DetailLabel>Name</DetailLabel>
          <DetailValue>{name}</DetailValue>
        </Detail>
        <Detail>
          <DetailLabel>Description</DetailLabel>
          <DetailValue>{description}</DetailValue>
        </Detail>
      </HoneyTokenReviewSection>
    </div>
  );
};
