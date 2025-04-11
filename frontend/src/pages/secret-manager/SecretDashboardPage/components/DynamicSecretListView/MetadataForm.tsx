import { Control, Controller, useFieldArray } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, FormLabel, IconButton, Input } from "@app/components/v2";

export const MetadataForm = ({ control }: { control: Control<any> }) => {
  const metadataFormFields = useFieldArray({
    control,
    name: "metadata"
  });

  return (
    <FormControl label="Metadata">
      <div className="flex flex-col space-y-2">
        {metadataFormFields.fields.map(({ id: metadataFieldId }, i) => (
          <div key={metadataFieldId} className="flex items-end space-x-2">
            <div className="flex-grow">
              {i === 0 && <span className="text-xs text-mineshaft-400">Key</span>}
              <Controller
                control={control}
                name={`metadata.${i}.key`}
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
            <div className="flex-grow">
              {i === 0 && (
                <FormLabel label="Value" className="text-xs text-mineshaft-400" isOptional />
              )}
              <Controller
                control={control}
                name={`metadata.${i}.value`}
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
              className="bottom-0.5 max-h-8"
              variant="outline_bg"
              onClick={() => metadataFormFields.remove(i)}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </div>
        ))}
        <div className={`${metadataFormFields.fields.length > 0 ? "pt-2" : ""}`}>
          <IconButton
            ariaLabel="Add Key"
            variant="outline_bg"
            size="xs"
            className="rounded-md"
            onClick={() => metadataFormFields.append({ key: "", value: "" })}
          >
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        </div>
      </div>
    </FormControl>
  );
};
