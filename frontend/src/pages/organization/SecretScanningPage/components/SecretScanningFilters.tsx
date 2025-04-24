import { Control, Controller } from "react-hook-form";
import { twMerge } from "tailwind-merge";

import { Button, FilterableSelect, FormControl, Select, SelectItem } from "@app/components/v2";
import { SecretScanningResolvedStatus } from "@app/hooks/api/secretScanning/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { SecretScanningFilterFormData } from "./types";

type Props = {
  control: Control<SecretScanningFilterFormData>;
  repositories: string[];
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["exportSecretScans"]>,
    state?: boolean
  ) => void;
};

export const SecretScanningFilter = ({ repositories, control, handlePopUpToggle }: Props) => {
  return (
    <div className={twMerge("flex w-full flex-wrap items-center justify-between bg-bunker-800")}>
      <div className="flex items-center -space-x-8">
        <Controller
          control={control}
          name="repositoryNames"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl
              label="Repository"
              errorText={error?.message}
              isError={Boolean(error)}
              className="mr-12 w-96"
            >
              <FilterableSelect
                value={value}
                isClearable
                isMulti
                onChange={onChange}
                placeholder="Select a repository..."
                options={repositories.map((repository) => ({
                  name: repository
                }))}
                getOptionValue={(option) => option.name}
                getOptionLabel={(option) => option.name}
              />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="resolved"
          render={({ field: { onChange, value }, fieldState: { error } }) => (
            <FormControl
              label="Status"
              errorText={error?.message}
              isError={Boolean(error)}
              className="mr-12 w-44"
            >
              <Select
                defaultValue={SecretScanningResolvedStatus.All}
                placeholder={SecretScanningResolvedStatus.All}
                value={value}
                onValueChange={onChange}
                className="w-full"
              >
                {Object.values(SecretScanningResolvedStatus).map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)} risks
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      </div>

      <div>
        <Button
          className="mt-[0.45rem]"
          onClick={() => handlePopUpToggle("exportSecretScans", true)}
          variant="solid"
          colorSchema="secondary"
        >
          Export
        </Button>
      </div>
    </div>
  );
};
