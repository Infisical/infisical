import { useFormContext } from "react-hook-form";

import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import { THoneyTokenForm } from "../schemas";
import { AwsHoneyTokenMappingFields } from "./AwsHoneyTokenMappingFields";

const COMPONENT_MAP: Record<HoneyTokenType, React.FC> = {
  [HoneyTokenType.AWS]: AwsHoneyTokenMappingFields
};

export const HoneyTokenMappingFields = () => {
  const { watch } = useFormContext<THoneyTokenForm>();

  const honeyTokenType = watch("type");

  const Component = COMPONENT_MAP[honeyTokenType];

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Map the decoy credential&apos;s fields to secrets in your Infisical project.
      </p>
      <Component />
    </>
  );
};
