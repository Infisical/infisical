import { useFormContext } from "react-hook-form";

import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import { THoneyTokenForm } from "../schemas";
import { AwsHoneyTokenParametersFields } from "./AwsHoneyTokenParametersFields";

const COMPONENT_MAP: Record<HoneyTokenType, React.FC> = {
  [HoneyTokenType.AWS]: AwsHoneyTokenParametersFields
};

export const HoneyTokenParametersFields = () => {
  const { watch } = useFormContext<THoneyTokenForm>();

  const honeyTokenType = watch("type");

  const Component = COMPONENT_MAP[honeyTokenType];

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Configure the required parameters for this Honey Token.
      </p>
      <Component />
    </>
  );
};
