import type { DefaultValues } from "react-hook-form";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import type {
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderDefinition,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "./types";

type TInvalidValuesCase = {
  name: string;
  values: unknown;
  issuePaths: readonly (readonly (string | number)[])[];
};

type TMaskedValueCase = {
  name: string;
  expected: unknown;
  defaultValuePath: readonly (string | number)[];
  payloadValuePath: readonly (string | number)[];
};

export type TDynamicSecretProviderContractFixture<
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues
> = {
  name: string;
  definition: TDynamicSecretProviderDefinition<TProvider, TCreateValues, TEditValues>;
  create: {
    context: TCreateDynamicSecretProviderFormContext;
    defaultValues: DefaultValues<TCreateValues>;
    validValues: TCreateValues;
    payload: unknown;
    invalidValues?: readonly TInvalidValuesCase[];
  };
  edit: {
    context: TEditDynamicSecretProviderFormContext;
    defaultValues: DefaultValues<TEditValues>;
    validValues: TEditValues;
    payload: unknown;
    invalidValues?: readonly TInvalidValuesCase[];
    maskedValues?: readonly TMaskedValueCase[];
  };
};

const getValueAtPath = (value: unknown, path: readonly (string | number)[]) =>
  path.reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string | number, unknown>)[segment];
  }, value);

const getIssuePaths = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[] }[] };
}) => (result.success ? [] : (result.error?.issues.map(({ path }) => path) ?? []));

/**
 * Reusable provider-contract suite. Rollout tickets supply their own fixture;
 * the foundation does not import or register production provider definitions.
 */
export const testDynamicSecretProviderContract = <
  TProvider extends DynamicSecretProviders,
  TCreateValues extends TDynamicSecretProviderFormValues,
  TEditValues extends TDynamicSecretProviderFormValues
>(
  fixture: TDynamicSecretProviderContractFixture<TProvider, TCreateValues, TEditValues>
) => {
  describe(`${fixture.name} dynamic-secret provider contract`, () => {
    it("declares provider-owned defaults", () => {
      assert.deepEqual(
        fixture.definition.create.getDefaultValues(fixture.create.context),
        fixture.create.defaultValues
      );
      assert.deepEqual(
        fixture.definition.edit.getDefaultValues(fixture.edit.context),
        fixture.edit.defaultValues
      );
    });

    it("accepts valid create and edit values", () => {
      assert.equal(
        fixture.definition.create.schema.safeParse(fixture.create.validValues).success,
        true
      );
      assert.equal(
        fixture.definition.edit.schema.safeParse(fixture.edit.validValues).success,
        true
      );
    });

    fixture.create.invalidValues?.forEach((invalidCase) => {
      it(`rejects invalid create values: ${invalidCase.name}`, () => {
        const result = fixture.definition.create.schema.safeParse(invalidCase.values);
        assert.equal(result.success, false);
        assert.deepEqual(getIssuePaths(result), invalidCase.issuePaths);
      });
    });

    fixture.edit.invalidValues?.forEach((invalidCase) => {
      it(`rejects invalid edit values: ${invalidCase.name}`, () => {
        const result = fixture.definition.edit.schema.safeParse(invalidCase.values);
        assert.equal(result.success, false);
        assert.deepEqual(getIssuePaths(result), invalidCase.issuePaths);
      });
    });

    it("adapts create and edit payloads", () => {
      assert.deepEqual(
        fixture.definition.create.toPayload(fixture.create.validValues, fixture.create.context),
        fixture.create.payload
      );
      assert.deepEqual(
        fixture.definition.edit.toPayload(fixture.edit.validValues, fixture.edit.context),
        fixture.edit.payload
      );
    });

    fixture.edit.maskedValues?.forEach((maskedValue) => {
      it(`preserves masked edit values: ${maskedValue.name}`, () => {
        const defaults = fixture.definition.edit.getDefaultValues(fixture.edit.context);
        const payload = fixture.definition.edit.toPayload(
          fixture.edit.validValues,
          fixture.edit.context
        );
        assert.equal(getValueAtPath(defaults, maskedValue.defaultValuePath), maskedValue.expected);
        assert.equal(getValueAtPath(payload, maskedValue.payloadValuePath), maskedValue.expected);
      });
    });
  });
};
