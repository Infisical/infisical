import type { ComponentType } from "react";
import type { DefaultValues, FieldValues } from "react-hook-form";
import type { z } from "zod";

import type {
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderCommonFields,
  TDynamicSecretProviderFormItem,
  TDynamicSecretProviderFormMode,
  TEditDynamicSecretProviderFormContext
} from "@app/components/dynamic-secrets/DynamicSecretProviderForm/types";
import type {
  DynamicSecretProviders,
  TCreateDynamicSecretDTO,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";

export type DynamicSecretFlowContext = TCreateDynamicSecretProviderFormContext;
export type DynamicSecretEditContext = TEditDynamicSecretProviderFormContext;

export type DynamicSecretRendererProps = {
  mode: TDynamicSecretProviderFormMode;
  context: DynamicSecretFlowContext;
  setSubmitState: (state: { isDisabled?: boolean; isPending?: boolean }) => void;
};

type EditDefinition<TValues extends FieldValues> = {
  schema: z.ZodType<TValues>;
  getDefaultValues: (context: DynamicSecretEditContext) => DefaultValues<TValues>;
  toPayload: (values: TValues, context: DynamicSecretEditContext) => TUpdateDynamicSecretDTO;
  Renderer?: ComponentType<DynamicSecretRendererProps>;
  commonFields?: TDynamicSecretProviderCommonFields;
  submitLabel: string;
  successMessage: string;
};

type ProviderDefinition<TValues extends FieldValues, TEditValues extends FieldValues> = {
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
  edit: EditDefinition<TEditValues>;
};

export type DynamicSecretFlowProvider = ProviderDefinition<FieldValues, FieldValues>;

export const defineFlowProvider = <
  TValues extends FieldValues,
  TEditValues extends FieldValues = TValues
>(
  definition: ProviderDefinition<TValues, TEditValues>
) => definition as unknown as DynamicSecretFlowProvider;
