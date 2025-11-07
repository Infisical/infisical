/* eslint-disable react/no-array-index-key */
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";

import { CertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import {
  Button,
  FormControl,
  FormLabel,
  GenericFieldLabel,
  IconButton,
  Input,
  Pagination,
  Select,
  SelectItem,
  Skeleton,
  Table,
  TableContainer,
  TBody,
  Td,
  TextArea,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useProject } from "@app/context";
import {
  PkiAlertEventTypeV2,
  PkiFilterFieldV2,
  PkiFilterOperatorV2,
  TCreatePkiAlertV2,
  TPkiAlertChannelV2,
  TPkiFilterRuleV2,
  useGetPkiAlertV2CurrentMatchingCertificates
} from "@app/hooks/api/pkiAlertsV2";

export const CreatePkiAlertV2FormSteps = () => {
  const { control, watch, setValue } = useFormContext<TCreatePkiAlertV2>();
  const { currentProject } = useProject();

  const [certificatesPage, setCertificatesPage] = useState(1);
  const certificatesPerPage = 10;

  const watchedFilters = watch("filters");
  const watchedChannels = watch("channels");
  const watchedEventType = watch("eventType");
  const watchedAlertBefore = watch("alertBefore");

  const { data: currentCertificatesData, isLoading: isLoadingCurrentCertificates } =
    useGetPkiAlertV2CurrentMatchingCertificates(
      {
        projectId: currentProject?.id || "",
        filters: watchedFilters || [],
        alertBefore: watchedAlertBefore || "30d",
        limit: certificatesPerPage,
        offset: (certificatesPage - 1) * certificatesPerPage
      },
      {
        enabled: !!currentProject?.id && watchedEventType === PkiAlertEventTypeV2.EXPIRATION,
        refetchOnWindowFocus: false
      }
    );

  const addFilter = () => {
    const currentFilters = watchedFilters || [];
    setValue("filters", [
      ...currentFilters,
      {
        field: PkiFilterFieldV2.COMMON_NAME,
        operator: PkiFilterOperatorV2.CONTAINS,
        value: ""
      }
    ]);
  };

  const removeFilter = (index: number) => {
    const currentFilters = watchedFilters || [];
    setValue(
      "filters",
      currentFilters.filter((_, i) => i !== index)
    );
  };

  const updateFilter = (index: number, updatedFilter: Partial<TPkiFilterRuleV2>) => {
    const currentFilters = [...(watchedFilters || [])];
    currentFilters[index] = { ...currentFilters[index], ...updatedFilter };
    setValue("filters", currentFilters);
  };

  const updateChannel = (
    index: number,
    updatedChannel: Partial<Omit<TPkiAlertChannelV2, "id" | "createdAt" | "updatedAt">>
  ) => {
    const currentChannels = [...(watchedChannels || [])];
    currentChannels[index] = { ...currentChannels[index], ...updatedChannel };
    setValue("channels", currentChannels);
  };

  const getFieldOperators = (field: PkiFilterFieldV2) => {
    if (field === PkiFilterFieldV2.INCLUDE_CAS) {
      return [PkiFilterOperatorV2.EQUALS];
    }
    return Object.values(PkiFilterOperatorV2);
  };

  const isValueBoolean = (field: PkiFilterFieldV2) => {
    return field === PkiFilterFieldV2.INCLUDE_CAS;
  };

  const canOperatorTakeArray = (operator: PkiFilterOperatorV2) => {
    return operator === PkiFilterOperatorV2.MATCHES;
  };

  const formatEventType = (eventType: PkiAlertEventTypeV2) => {
    switch (eventType) {
      case PkiAlertEventTypeV2.EXPIRATION:
        return "Certificate Expiration";
      case PkiAlertEventTypeV2.RENEWAL:
        return "Certificate Renewal";
      case PkiAlertEventTypeV2.ISSUANCE:
        return "Certificate Issuance";
      case PkiAlertEventTypeV2.REVOCATION:
        return "Certificate Revocation";
      default:
        return eventType;
    }
  };

  const formatAlertBefore = (alertBefore?: string) => {
    if (!alertBefore) return "-";

    const match = alertBefore.match(/^(\d+)([dwmy])$/);
    if (!match) return alertBefore;

    const [, value, unit] = match;
    const unitMap = {
      d: "days",
      w: "weeks",
      m: "months",
      y: "years"
    };

    return `${value} ${unitMap[unit as keyof typeof unitMap] || unit}`;
  };

  return (
    <>
      <Tab.Panel>
        <div className="space-y-6">
          <p className="mb-4 text-sm text-bunker-300">
            Choose the event that will trigger this alert notification.
          </p>

          <div className="w-full">
            <Controller
              control={control}
              name="eventType"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Alert Type" isError={Boolean(error)} errorText={error?.message}>
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                    className="w-full"
                  >
                    <SelectItem value={PkiAlertEventTypeV2.EXPIRATION}>
                      Certificate Expiration
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          </div>
        </div>
      </Tab.Panel>

      <Tab.Panel>
        <div className="space-y-6">
          <p className="mb-4 text-sm text-bunker-300">
            Configure the name, description, and timing for your alert.
          </p>

          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Alert Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g., prod-cert-expiring-soon" />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="description"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Description (Optional)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <TextArea {...field} placeholder="Alert description..." rows={2} />
              </FormControl>
            )}
          />

          {watchedEventType === PkiAlertEventTypeV2.EXPIRATION && (
            <Controller
              control={control}
              name="alertBefore"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Alert Before"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  helperText="Format: number + unit (d=days, w=weeks, m=months, y=years). Example: 30d"
                >
                  <Input {...field} placeholder="30d" />
                </FormControl>
              )}
            />
          )}
        </div>
      </Tab.Panel>

      <Tab.Panel>
        <div className="space-y-6">
          <p className="mb-4 text-sm text-bunker-300">
            Add filter rules to specify which certificates should trigger this alert. Leave empty to
            monitor all certificates.
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <FormLabel label="Certificate Filter Rules" />
              <Button
                type="button"
                variant="outline_bg"
                size="sm"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={addFilter}
              >
                Add Filter
              </Button>
            </div>

            {watchedFilters?.map((filter, index) => (
              <div
                key={`filter-${index}`}
                className="space-y-2 rounded-md border border-mineshaft-600 p-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-mineshaft-100">
                    Filter Rule #{index + 1}
                  </h4>
                  <IconButton
                    size="sm"
                    variant="plain"
                    colorSchema="danger"
                    ariaLabel="Remove filter"
                    onClick={() => removeFilter(index)}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-1">
                    <FormControl label="Field">
                      <Select
                        value={filter.field}
                        onValueChange={(value) =>
                          updateFilter(index, {
                            field: value as PkiFilterFieldV2,
                            operator:
                              value === PkiFilterFieldV2.INCLUDE_CAS
                                ? PkiFilterOperatorV2.EQUALS
                                : filter.operator,
                            value: isValueBoolean(value as PkiFilterFieldV2) ? false : ""
                          })
                        }
                        className="w-full min-w-[200px]"
                      >
                        <SelectItem value={PkiFilterFieldV2.COMMON_NAME}>Common Name</SelectItem>
                        <SelectItem value={PkiFilterFieldV2.PROFILE_NAME}>Profile Name</SelectItem>
                        <SelectItem value={PkiFilterFieldV2.SAN}>
                          Subject Alternative Names
                        </SelectItem>
                        <SelectItem value={PkiFilterFieldV2.INCLUDE_CAS}>
                          Include Certificate Authorities
                        </SelectItem>
                      </Select>
                    </FormControl>
                  </div>

                  <div className="md:col-span-1">
                    <FormControl label="Operator">
                      <Select
                        value={filter.operator}
                        onValueChange={(value) =>
                          updateFilter(index, { operator: value as PkiFilterOperatorV2 })
                        }
                        className="w-full min-w-[140px]"
                      >
                        {getFieldOperators(filter.field).map((operator) => (
                          <SelectItem key={operator} value={operator}>
                            {operator
                              .replace(/_/g, " ")
                              .toLowerCase()
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
                          </SelectItem>
                        ))}
                      </Select>
                    </FormControl>
                  </div>

                  <div className="md:col-span-1">
                    <FormControl label="Value">
                      {isValueBoolean(filter.field) ? (
                        <Select
                          value={String(filter.value)}
                          onValueChange={(value) =>
                            updateFilter(index, { value: value === "true" })
                          }
                          className="w-full"
                        >
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </Select>
                      ) : (
                        <Input
                          value={
                            Array.isArray(filter.value)
                              ? filter.value.join(", ")
                              : String(filter.value || "")
                          }
                          onChange={(e) => {
                            const { value } = e.target;
                            updateFilter(index, { value });
                          }}
                          onBlur={(e) => {
                            const { value } = e.target;
                            if (canOperatorTakeArray(filter.operator) && value.includes(",")) {
                              const finalValue = value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean);
                              updateFilter(index, { value: finalValue });
                            }
                          }}
                          placeholder={
                            canOperatorTakeArray(filter.operator)
                              ? "example.com, test.com"
                              : "example.com"
                          }
                          className="w-full"
                        />
                      )}
                    </FormControl>
                  </div>
                </div>
              </div>
            ))}

            {(!watchedFilters || watchedFilters.length === 0) && (
              <div className="py-8 text-center text-bunker-400">
                No filter rules configured. This alert will monitor all certificates.
              </div>
            )}
          </div>
        </div>
      </Tab.Panel>

      <Tab.Panel>
        <div className="space-y-6">
          <p className="mb-4 text-sm text-bunker-300">
            Preview all certificates that match your filter criteria. This shows all non-expired
            certificates that would be monitored by this alert.
          </p>

          <div className="space-y-4">
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-1/2">SAN / CN</Th>
                    <Th className="w-1/4">Not Before</Th>
                    <Th className="w-1/4">Not After</Th>
                  </Tr>
                </THead>
                <TBody>
                  {(() => {
                    if (watchedEventType !== PkiAlertEventTypeV2.EXPIRATION) {
                      return (
                        <Tr>
                          <Td colSpan={3} className="py-8 text-center text-gray-400">
                            Preview is only available for Certificate Expiration alerts
                          </Td>
                        </Tr>
                      );
                    }

                    if (isLoadingCurrentCertificates) {
                      return Array.from({ length: 5 }, (_, index) => (
                        <Tr key={`skeleton-row-${index}`}>
                          <Td>
                            <Skeleton className="h-4 w-32" />
                          </Td>
                          <Td>
                            <Skeleton className="h-4 w-24" />
                          </Td>
                          <Td>
                            <Skeleton className="h-4 w-24" />
                          </Td>
                        </Tr>
                      ));
                    }

                    if (currentCertificatesData?.certificates?.length) {
                      return currentCertificatesData.certificates.map((cert) => (
                        <Tr key={cert.id} className="group h-10">
                          <Td className="max-w-0">
                            <div className="flex items-center gap-2">
                              <CertificateDisplayName
                                cert={{
                                  altNames: cert.san?.join(", ") || null,
                                  commonName: cert.commonName
                                }}
                                maxLength={48}
                                fallback="—"
                              />
                              {(cert.enrollmentType === "ca" ||
                                cert.enrollmentType === "internal-ca") && (
                                <Badge variant="info" className="shrink-0 text-xs">
                                  CA
                                </Badge>
                              )}
                            </div>
                          </Td>
                          <Td>
                            {cert.notBefore
                              ? new Date(cert.notBefore).toLocaleDateString("en-CA")
                              : "-"}
                          </Td>
                          <Td>
                            {cert.notAfter
                              ? new Date(cert.notAfter).toLocaleDateString("en-CA")
                              : "-"}
                          </Td>
                        </Tr>
                      ));
                    }

                    return (
                      <Tr>
                        <Td colSpan={3} className="py-8 text-center text-gray-400">
                          No certificates currently match this alert&apos;s criteria
                        </Td>
                      </Tr>
                    );
                  })()}
                </TBody>
              </Table>
            </TableContainer>

            {(currentCertificatesData?.total || 0) > 0 && (
              <div className="flex justify-center">
                <Pagination
                  count={currentCertificatesData?.total || 0}
                  page={certificatesPage}
                  onChangePage={setCertificatesPage}
                  perPage={certificatesPerPage}
                  onChangePerPage={() => {}}
                />
              </div>
            )}
          </div>
        </div>
      </Tab.Panel>

      <Tab.Panel>
        <div className="space-y-6">
          <p className="mb-4 text-sm text-bunker-300">
            Set up email notifications to receive alerts when events occur.
          </p>

          <div className="space-y-4">
            <FormControl label="Email Recipients">
              <TextArea
                value={
                  Array.isArray((watchedChannels?.[0]?.config as any)?.recipients)
                    ? (watchedChannels[0].config as any).recipients.join(", ")
                    : ""
                }
                onChange={(e) => {
                  const emailList = e.target.value
                    .split(",")
                    .map((email) => email.trim())
                    .filter((email) => email.length > 0);
                  updateChannel(0, { config: { recipients: emailList }, enabled: true });
                }}
                placeholder="admin@example.com, security@example.com"
                className="w-full"
                rows={2}
              />
            </FormControl>
          </div>
        </div>
      </Tab.Panel>

      <Tab.Panel>
        <div className="mb-4 flex flex-col gap-6">
          <p className="mb-4 text-sm text-bunker-300">
            Please review the settings below before creating your alert.
          </p>

          <div className="flex flex-col gap-3">
            <div className="w-full border-b border-mineshaft-600">
              <span className="text-sm text-mineshaft-300">Basic Information</span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <GenericFieldLabel label="Name">{watch("name") || "Not specified"}</GenericFieldLabel>
              <GenericFieldLabel label="Event Type">
                {formatEventType(watchedEventType)}
              </GenericFieldLabel>
              <GenericFieldLabel label="Status">
                <div className="mt-1">
                  <Badge variant={watch("enabled") ? "success" : "danger"}>
                    {watch("enabled") ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </GenericFieldLabel>
              {watchedEventType === PkiAlertEventTypeV2.EXPIRATION && (
                <GenericFieldLabel label="Alert Before">
                  {formatAlertBefore(watch("alertBefore"))}
                </GenericFieldLabel>
              )}
              {watch("description") && (
                <GenericFieldLabel label="Description">{watch("description")}</GenericFieldLabel>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="w-full border-b border-mineshaft-600">
              <span className="text-sm text-mineshaft-300">Filter Rules</span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {watchedFilters && watchedFilters.length > 0 ? (
                watchedFilters.map((filter, index) => (
                  <GenericFieldLabel key={`review-filter-${index}`} label={`Rule ${index + 1}`}>
                    <span className="font-mono text-xs">
                      {filter.field
                        .replace(/_/g, " ")
                        .toLowerCase()
                        .replace(/\b\w/g, (l) => l.toUpperCase())}{" "}
                      {filter.operator
                        .replace(/_/g, " ")
                        .toLowerCase()
                        .replace(/\b\w/g, (l) => l.toUpperCase())}{" "}
                      &quot;{String(filter.value)}&quot;
                    </span>
                  </GenericFieldLabel>
                ))
              ) : (
                <span className="text-bunker-400">
                  No filter rules - will monitor all certificates
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="w-full border-b border-mineshaft-600">
              <span className="text-sm text-mineshaft-300">Notifications</span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <GenericFieldLabel label="Email Recipients">
                {Array.isArray((watchedChannels?.[0]?.config as any)?.recipients)
                  ? (watchedChannels[0].config as any).recipients.join(", ")
                  : (watchedChannels?.[0]?.config as any)?.recipients || "No recipients"}
              </GenericFieldLabel>
            </div>
          </div>
        </div>
      </Tab.Panel>
    </>
  );
};
