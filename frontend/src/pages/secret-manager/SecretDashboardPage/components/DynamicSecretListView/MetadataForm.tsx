import { Control, Controller, useFieldArray } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, FormControl, FormLabel, IconButton, Input } from "@app/components/v2";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@app/components/v3";

export const MetadataForm = ({
  control,
  name = "metadata",
  title = "Metadata",
  isValueRequired = false
}: {
  control: Control<any>;
  name?: string;
  title?: string;
  isValueRequired?: boolean;
}) => {
  const metadataFormFields = useFieldArray({
    control,
    name
  });

  return (
    <FormControl label={title} className="mt-4">
      <div className="flex flex-col space-y-2 pt-1">
        {metadataFormFields.fields.length === 0 ? (
          <Empty className="gap-2 p-6 md:p-6">
            <EmptyHeader>
              <EmptyTitle>No metadata entries</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button
                variant="outline_bg"
                size="xs"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => metadataFormFields.append({ key: "", value: "" })}
              >
                Add entry
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div key={metadataFieldId} className="flex items-start space-x-2">
                <div className="grow">
                  {i === 0 && <FormLabel label="Key" className="text-xs text-mineshaft-400" />}
                  <Controller
                    control={control}
                    name={`${name}.${i}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} className="max-h-8" />
                      </FormControl>
                    )}
                  />
                </div>
                <div className="grow">
                  {i === 0 && (
                    <FormLabel
                      label="Value"
                      className="text-xs text-mineshaft-400"
                      isOptional={!isValueRequired}
                    />
                  )}
                  <Controller
                    control={control}
                    name={`${name}.${i}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        className="mb-0"
                      >
                        <Input {...field} className="max-h-8" />
                      </FormControl>
                    )}
                  />
                </div>
                <IconButton
                  ariaLabel="delete key"
                  className={`${i === 0 ? "mt-[1.14rem]" : ""} max-h-8`}
                  variant="outline_bg"
                  onClick={() => metadataFormFields.remove(i)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </div>
            ))}
            <div className="pt-2">
              <Button
                variant="outline_bg"
                size="xs"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => metadataFormFields.append({ key: "", value: "" })}
              >
                Add entry
              </Button>
            </div>
          </>
        )}
      </div>
    </FormControl>
  );
};
