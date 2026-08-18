import { FieldValues } from "react-hook-form";

import { DynamicSecretProviderFields } from "./DynamicSecretProviderFields";
import { DynamicSecretProviderGroup } from "./DynamicSecretProviderGroup";
import {
  isDynamicSecretProviderFieldGroup,
  TDynamicSecretProviderField,
  TDynamicSecretProviderFieldGroup,
  TDynamicSecretProviderFormItem
} from "./types";

type Props<TValues extends FieldValues> = {
  items: readonly TDynamicSecretProviderFormItem<TValues>[];
};

type FormSegment<TValues extends FieldValues> =
  | { type: "fields"; fields: TDynamicSecretProviderField<TValues>[] }
  | { type: "group"; group: TDynamicSecretProviderFieldGroup<TValues> };

const segmentFormItems = <TValues extends FieldValues>(
  items: readonly TDynamicSecretProviderFormItem<TValues>[]
): FormSegment<TValues>[] => {
  const segments: FormSegment<TValues>[] = [];
  let fieldBuffer: TDynamicSecretProviderField<TValues>[] = [];

  const flushFields = () => {
    if (fieldBuffer.length === 0) return;
    segments.push({ type: "fields", fields: fieldBuffer });
    fieldBuffer = [];
  };

  items.forEach((item) => {
    if (isDynamicSecretProviderFieldGroup(item)) {
      flushFields();
      segments.push({ type: "group", group: item });
      return;
    }
    fieldBuffer.push(item);
  });

  flushFields();
  return segments;
};

const FieldGroup = <TValues extends FieldValues>({
  group
}: {
  group: TDynamicSecretProviderFieldGroup<TValues>;
}) => {
  const fields = <DynamicSecretProviderFields fields={group.fields} />;

  if (group.presentation === "collapse") {
    return (
      <DynamicSecretProviderGroup
        id={group.id}
        presentation="collapse"
        title={group.title}
        description={group.description}
      >
        {fields}
      </DynamicSecretProviderGroup>
    );
  }

  return (
    <DynamicSecretProviderGroup
      id={group.id}
      presentation="panel"
      title={group.title}
      description={group.description}
      surface={group.surface ?? Boolean(group.title)}
    >
      {fields}
    </DynamicSecretProviderGroup>
  );
};

/** Renders a mix of flat fields and panel/collapse groups under Configuration. */
export const DynamicSecretProviderFormItems = <TValues extends FieldValues>({
  items
}: Props<TValues>) => {
  const segments = segmentFormItems(items);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "fields") {
          return (
            <DynamicSecretProviderFields
              // Consecutive flat fields share one grid; index is stable for a given items array.
              // eslint-disable-next-line react/no-array-index-key
              key={`fields-${index}`}
              fields={segment.fields}
            />
          );
        }

        return <FieldGroup key={segment.group.id} group={segment.group} />;
      })}
    </>
  );
};
