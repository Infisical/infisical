import type { ComponentType } from "react";
import type { DefaultValues, FieldPath, FieldValues } from "react-hook-form";
import type { z } from "zod";

import type {
  DynamicSecretProviders,
  TCreateDynamicSecretDTO,
  TDynamicSecret,
  TDynamicSecretProvider,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import type { ProjectEnv } from "@app/hooks/api/types";

export const DYNAMIC_SECRET_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "repeatable-fields",
  "permission-aware-fields",
  "remote-options",
  "import-workflow",
  "non-scalar-value",
  "multi-create",
  "post-create-workflow",
  "context-aware-fields"
] as const;

export type TDynamicSecretCustomRendererReason =
  (typeof DYNAMIC_SECRET_CUSTOM_RENDERER_REASONS)[number];

export type TDynamicSecretProviderFormMode = "create" | "edit";

export type TDynamicSecretProviderCommonField = {
  isVisible?: boolean;
  isDisabled?: boolean;
  label?: string;
  description?: string;
};

export type TDynamicSecretProviderCommonFields = {
  name?: TDynamicSecretProviderCommonField;
  defaultTTL?: TDynamicSecretProviderCommonField;
  maxTTL?: TDynamicSecretProviderCommonField;
  environment?: TDynamicSecretProviderCommonField;
  configurationHeading?: string | false;
};

export type TDynamicSecretFormEnvironment = Pick<ProjectEnv, "name" | "slug">;

export type TDynamicSecretProviderFormValues<TInputs extends FieldValues = FieldValues> = {
  name: string;
  defaultTTL: string;
  maxTTL?: string | null;
  environment?: TDynamicSecretFormEnvironment;
  usernameTemplate?: string | null;
  inputs: TInputs;
};

type TDynamicSecretBaseField<TValues extends FieldValues> = {
  name: FieldPath<TValues>;
  label: string;
  description?: string;
  placeholder?: string;
  isOptional?: boolean;
  isDisabled?: boolean;
  layout?: "full" | "half";
};

export type TDynamicSecretProviderField<TValues extends FieldValues> =
  | (TDynamicSecretBaseField<TValues> & {
      type: "text" | "secret";
      autoComplete?: string;
    })
  | (TDynamicSecretBaseField<TValues> & {
      type: "number";
      min?: number;
      max?: number;
      step?: number | "any";
    })
  | (TDynamicSecretBaseField<TValues> & {
      type: "textarea";
      rows?: number;
    })
  | (TDynamicSecretBaseField<TValues> & {
      type: "select";
      options: readonly { label: string; value: string }[];
    })
  | (TDynamicSecretBaseField<TValues> & {
      type: "switch";
    });

export type TDynamicSecretProviderFieldGroupPresentation = "panel" | "collapse";

type TDynamicSecretProviderFieldGroupBase<TValues extends FieldValues> = {
  kind: "group";
  id: string;
  description?: string;
  fields: readonly TDynamicSecretProviderField<TValues>[];
};

export type TDynamicSecretProviderFieldGroup<TValues extends FieldValues> =
  | (TDynamicSecretProviderFieldGroupBase<TValues> & {
      presentation?: "panel";
      title?: string;
      surface?: boolean;
    })
  | (TDynamicSecretProviderFieldGroupBase<TValues> & {
      presentation: "collapse";
      title: string;
    });

export type TDynamicSecretProviderFormItem<TValues extends FieldValues> =
  | TDynamicSecretProviderField<TValues>
  | TDynamicSecretProviderFieldGroup<TValues>;

export const isDynamicSecretProviderFieldGroup = <TValues extends FieldValues>(
  item: TDynamicSecretProviderFormItem<TValues>
): item is TDynamicSecretProviderFieldGroup<TValues> => "kind" in item && item.kind === "group";

export type TDynamicSecretProviderOf<TProvider extends DynamicSecretProviders> = Extract<
  TDynamicSecretProvider,
  { type: TProvider }
>;

export type TCreateDynamicSecretProviderDTO<TProvider extends DynamicSecretProviders> = Omit<
  TCreateDynamicSecretDTO,
  "provider"
> & {
  provider: TDynamicSecretProviderOf<TProvider>;
};

export type TDynamicSecretWithInputs = TDynamicSecret & { inputs: unknown };

export type TCreateDynamicSecretProviderFormContext = {
  projectSlug: string;
  secretPath: string;
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

export type TEditDynamicSecretProviderFormContext = {
  projectSlug: string;
  secretPath: string;
  environment: string;
  dynamicSecret: TDynamicSecretWithInputs;
};

export type TDynamicSecretProviderRendererProps = {
  mode: TDynamicSecretProviderFormMode;
  context: TCreateDynamicSecretProviderFormContext | TEditDynamicSecretProviderFormContext;
  setSubmitState: (state: { isDisabled?: boolean; isPending?: boolean }) => void;
};

export type TDynamicSecretProviderCustomRenderer = {
  reasons: readonly [TDynamicSecretCustomRendererReason, ...TDynamicSecretCustomRendererReason[]];
  Component: ComponentType<TDynamicSecretProviderRendererProps>;
};

export type TDynamicSecretProviderDefinition<
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues = TCreateValues
> = {
  provider: TProvider;
  label: string;
  fields?: readonly TDynamicSecretProviderFormItem<TCreateValues & TEditValues>[];
  customRenderer?: TDynamicSecretProviderCustomRenderer;
  create: {
    schema: z.ZodType<TCreateValues>;
    getDefaultValues: (
      context: TCreateDynamicSecretProviderFormContext
    ) => DefaultValues<TCreateValues>;
    toPayload: (
      values: TCreateValues,
      context: TCreateDynamicSecretProviderFormContext
    ) =>
      | TCreateDynamicSecretProviderDTO<TProvider>
      | readonly TCreateDynamicSecretProviderDTO<TProvider>[];
    fields?: readonly TDynamicSecretProviderFormItem<TCreateValues>[];
    customRenderer?: TDynamicSecretProviderCustomRenderer;
    commonFields?: TDynamicSecretProviderCommonFields;
    submitLabel: string;
  };
  edit: {
    schema: z.ZodType<TEditValues>;
    getDefaultValues: (
      context: TEditDynamicSecretProviderFormContext
    ) => DefaultValues<TEditValues>;
    toPayload: (
      values: TEditValues,
      context: TEditDynamicSecretProviderFormContext
    ) => TUpdateDynamicSecretDTO;
    fields?: readonly TDynamicSecretProviderFormItem<TEditValues>[];
    customRenderer?: TDynamicSecretProviderCustomRenderer;
    commonFields?: TDynamicSecretProviderCommonFields;
    submitLabel: string;
    successMessage: string;
  };
};

export const defineDynamicSecretProvider = <
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues = TCreateValues
>(
  definition: TDynamicSecretProviderDefinition<TProvider, TCreateValues, TEditValues>
) => definition;
