import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { SingleValue } from "react-select";
import { faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  FilterableSelect,
  FormControl
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { TAiMcpActivityLog } from "@app/hooks/api";

export type TMCPActivityLogFilter = {
  endpoint?: string;
  tool?: string;
  user?: string;
};

type Props = {
  filter: TMCPActivityLogFilter;
  setFilter: (filter: TMCPActivityLogFilter) => void;
  activityLogs: TAiMcpActivityLog[];
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

const getActiveFilterCount = (filter: TMCPActivityLogFilter): number => {
  let count = 0;
  if (filter.endpoint) count += 1;
  if (filter.tool) count += 1;
  if (filter.user) count += 1;
  return count;
};

export const MCPActivityLogsFilter = ({ filter, setFilter, activityLogs }: Props) => {
  const { control, handleSubmit, setValue, formState } = useForm<TMCPActivityLogFilter>({
    values: filter
  });

  // Generate filter options dynamically from activity logs
  const endpointOptions = useMemo(() => {
    const uniqueEndpoints = Array.from(new Set(activityLogs.map((log) => log.endpointName)));
    return uniqueEndpoints.map((endpoint) => ({ label: endpoint, value: endpoint }));
  }, [activityLogs]);

  const toolOptions = useMemo(() => {
    const uniqueTools = Array.from(new Set(activityLogs.map((log) => log.toolName)));
    return uniqueTools.map((tool) => ({ label: tool, value: tool }));
  }, [activityLogs]);

  const userOptions = useMemo(() => {
    const uniqueUsers = Array.from(new Set(activityLogs.map((log) => log.actor)));
    return uniqueUsers.map((user) => ({ label: user, value: user }));
  }, [activityLogs]);

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
                      endpoint: undefined,
                      tool: undefined,
                      user: undefined
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
                  setValue("endpoint", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="endpoint"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <FilterableSelect
                        value={endpointOptions.find((opt) => opt.value === value) ?? null}
                        isClearable
                        onChange={(option) =>
                          onChange((option as SingleValue<(typeof endpointOptions)[number]>)?.value)
                        }
                        placeholder="All endpoints"
                        options={endpointOptions}
                        getOptionValue={(option) => option.value}
                        getOptionLabel={(option) => option.label}
                      />
                    </FormControl>
                  )}
                />
              </FilterItem>

              <FilterItem
                label="Tool"
                onClear={() => {
                  setValue("tool", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="tool"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <FilterableSelect
                        value={toolOptions.find((opt) => opt.value === value) ?? null}
                        isClearable
                        onChange={(option) =>
                          onChange((option as SingleValue<(typeof toolOptions)[number]>)?.value)
                        }
                        placeholder="All tools"
                        options={toolOptions}
                        getOptionValue={(option) => option.value}
                        getOptionLabel={(option) => option.label}
                      />
                    </FormControl>
                  )}
                />
              </FilterItem>

              <FilterItem
                label="User"
                onClear={() => {
                  setValue("user", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="user"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <FilterableSelect
                        value={userOptions.find((opt) => opt.value === value) ?? null}
                        isClearable
                        onChange={(option) =>
                          onChange((option as SingleValue<(typeof userOptions)[number]>)?.value)
                        }
                        placeholder="All users"
                        options={userOptions}
                        getOptionValue={(option) => option.value}
                        getOptionLabel={(option) => option.label}
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
