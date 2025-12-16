import { Controller, useForm } from "react-hook-form";
import { faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  FormControl,
  Input
} from "@app/components/v2";
import { Badge } from "@app/components/v3";

import { mcpActivityLogFilterFormSchema, TMCPActivityLogFilterFormData } from "./types";

type Props = {
  filter: TMCPActivityLogFilterFormData;
  setFilter: (filter: TMCPActivityLogFilterFormData) => void;
};

type FilterItemProps = {
  label: string;
  onClear: () => void;
  children: React.ReactNode;
};

const FilterItem = ({ label, onClear, children }: FilterItemProps) => {
  return (
    <div className="flex flex-col justify-between">
      <div className="flex items-center pr-1">
        <p className="text-xs opacity-60">{label}</p>
        <Button
          onClick={() => onClear()}
          variant="link"
          className="ml-auto font-normal text-mineshaft-400 transition-all duration-75 hover:text-mineshaft-300"
          size="xs"
        >
          Clear
        </Button>
      </div>
      <div>{children}</div>
    </div>
  );
};

const getActiveFilterCount = (filter: TMCPActivityLogFilterFormData): number => {
  let count = 0;
  if (filter.endpointName) count += 1;
  if (filter.serverName) count += 1;
  if (filter.toolName) count += 1;
  if (filter.actor) count += 1;
  return count;
};

export const MCPActivityLogsFilter = ({ filter, setFilter }: Props) => {
  const { control, handleSubmit, setValue, formState } = useForm<TMCPActivityLogFilterFormData>({
    resolver: zodResolver(mcpActivityLogFilterFormSchema),
    values: filter
  });

  const activeFilterCount = getActiveFilterCount(filter);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline_bg" colorSchema="primary" className="relative">
          <FontAwesomeIcon icon={faFilterCircleXmark} className="mr-2" />
          Filter
          {activeFilterCount > 0 && (
            <Badge className="absolute -top-2 -right-2" variant="info">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="mt-4 overflow-visible py-4">
        <form onSubmit={handleSubmit(setFilter)}>
          <div className="flex max-w-96 min-w-80 flex-col font-inter">
            <div className="mb-3 flex items-center border-b border-b-mineshaft-500 px-3 pb-2">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>Filters</span>
                  <Badge isSquare variant="info">
                    {activeFilterCount}
                  </Badge>
                </div>
                <Button
                  onClick={() => {
                    setFilter({
                      endpointName: undefined,
                      serverName: undefined,
                      toolName: undefined,
                      actor: undefined
                    });
                  }}
                  variant="link"
                  className="text-mineshaft-400"
                  size="xs"
                >
                  Clear filters
                </Button>
              </div>
            </div>

            <div className="space-y-3 px-3">
              <FilterItem
                label="Endpoint"
                onClear={() => {
                  setValue("endpointName", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="endpointName"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <Input
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value || undefined)}
                        placeholder="Filter by endpoint name"
                        className="bg-mineshaft-800"
                      />
                    </FormControl>
                  )}
                />
              </FilterItem>

              <FilterItem
                label="Server"
                onClear={() => {
                  setValue("serverName", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="serverName"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <Input
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value || undefined)}
                        placeholder="Filter by server name"
                        className="bg-mineshaft-800"
                      />
                    </FormControl>
                  )}
                />
              </FilterItem>

              <FilterItem
                label="Tool"
                onClear={() => {
                  setValue("toolName", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="toolName"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <Input
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value || undefined)}
                        placeholder="Filter by tool name"
                        className="bg-mineshaft-800"
                      />
                    </FormControl>
                  )}
                />
              </FilterItem>

              <FilterItem
                label="User"
                onClear={() => {
                  setValue("actor", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="actor"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <Input
                        value={value || ""}
                        onChange={(e) => onChange(e.target.value || undefined)}
                        placeholder="Filter by user"
                        className="bg-mineshaft-800"
                      />
                    </FormControl>
                  )}
                />
              </FilterItem>
            </div>

            <div className="mt-4 px-3">
              <Button size="xs" type="submit" isDisabled={!formState.isDirty}>
                Apply
              </Button>
            </div>
          </div>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
