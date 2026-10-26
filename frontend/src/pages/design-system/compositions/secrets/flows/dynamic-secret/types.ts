import type { ComponentType } from "react";
import type { DefaultValues, FieldValues } from "react-hook-form";
import type { z } from "zod";

import type {
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderCommonFields,
  TDynamicSecretProviderFormItem
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import type {
  DynamicSecretProviders,
  TCreateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

export type DynamicSecretFlowContext = TCreateDynamicSecretProviderFormContext;

export type DynamicSecretRendererProps = {
  context: DynamicSecretFlowContext;
  setSubmitState: (state: { isDisabled?: boolean; isPending?: boolean }) => void;
};

type ProviderDefinition<TValues extends FieldValues> = {
  provider: DynamicSecretProviders;
  label: string;
  schema: z.ZodType<TValues>;
  getDefaultValues: (context: DynamicSecretFlowContext) => DefaultValues<TValues>;
  toPayload: (
    values: TValues,
    context: DynamicSecretFlowContext
  ) => TCreateDynamicSecretDTO | readonly TCreateDynamicSecretDTO[];
  fields?: readonly TDynamicSecretProviderFormItem<TValues>[];
  Renderer?: ComponentType<DynamicSecretRendererProps>;
  commonFields?: TDynamicSecretProviderCommonFields;
  submitLabel: string;
};

export type DynamicSecretFlowProvider = ProviderDefinition<FieldValues>;

export const defineFlowProvider = <TValues extends FieldValues>(
  definition: ProviderDefinition<TValues>
) => definition as unknown as DynamicSecretFlowProvider;
