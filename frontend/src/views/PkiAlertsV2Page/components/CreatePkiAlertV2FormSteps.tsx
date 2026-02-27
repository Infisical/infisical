/* eslint-disable react/no-array-index-key */
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { faSlack } from "@fortawesome/free-brands-svg-icons";
import {
  faBell,
  faCheck,
  faChevronDown,
  faEnvelope,
  faKey,
  faLink,
  faPlus,
  faTrash,
  faTriangleExclamation,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";

import { CertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  FormLabel,
  GenericFieldLabel,
  IconButton,
  Input,
  Pagination,
  Select,
  SelectItem,
  Skeleton,
  Switch,
  Table,
  TableContainer,
  TBody,
  Td,
  TextArea,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  Badge,
  UnstableAccordion as Accordion,
  UnstableAccordionContent as AccordionContent,
  UnstableAccordionItem as AccordionItem,
  UnstableAccordionTrigger as AccordionTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  PkiAlertChannelTypeV2,
  PkiAlertEventTypeV2,
  PkiFilterFieldV2,
  PkiFilterOperatorV2,
  TCreatePkiAlertV2,
  TPkiAlertChannelConfigEmail,
  TPkiAlertChannelConfigPagerDuty,
  TPkiAlertChannelConfigSlack,
  TPkiAlertChannelConfigWebhook,
  TPkiFilterRuleV2,
  useGetPkiAlertV2CurrentMatchingCertificates,
  useTestPkiWebhookConfigV2
} from "@app/hooks/api/pkiAlertsV2";

import {
  formatAlertBefore,
  formatEventType,
  getChannelDisplayName,
  getChannelIcon,
  getChannelSummary
} from "../utils/pki-alert-formatters";

const MAX_CHANNELS = 10;

interface CreatePkiAlertV2FormStepsProps {
  expandedChannel: string | undefined;
  setExpandedChannel: (channel: string | undefined) => void;
}

type ChannelUIState = {
  emailInput?: string;
  webhookTest?: {
    success: boolean | null;
    error?: string;
    isLoading?: boolean;
  };
};

export const CreatePkiAlertV2FormSteps = ({
  expandedChannel,
  setExpandedChannel
}: CreatePkiAlertV2FormStepsProps) => {
  const {
    control,
    watch,
    setValue,
    trigger,
    clearErrors,
    formState: { errors }
  } = useFormContext<TCreatePkiAlertV2>();
  const { currentProject } = useProject();

  const [certificatesPage, setCertificatesPage] = useState(1);
  const certificatesPerPage = 6;

  const [channelUIStates, setChannelUIStates] = useState<Record<string, ChannelUIState>>({});

  // Track when a channel is intentionally added (vs loaded from existing data)
  const justAddedRef = useRef(false);

  const { mutateAsync: testWebhookConfig } = useTestPkiWebhookConfigV2();

  const {
    fields: channelFields,
    prepend: prependChannel,
    remove: removeChannel
  } = useFieldArray({
    control,
    name: "channels"
  });

  const watchedFilters = watch("filters");
  const watchedChannels = watch("channels") || [];
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

  const isChannelLimitReached = watchedChannels.length >= MAX_CHANNELS;

  const addChannel = (type: PkiAlertChannelTypeV2) => {
    if (isChannelLimitReached) return;
    justAddedRef.current = true;

    let config:
      | TPkiAlertChannelConfigEmail
      | TPkiAlertChannelConfigWebhook
      | TPkiAlertChannelConfigSlack
      | TPkiAlertChannelConfigPagerDuty;
    switch (type) {
      case PkiAlertChannelTypeV2.EMAIL:
        config = { recipients: [] };
        break;
      case PkiAlertChannelTypeV2.WEBHOOK:
        config = { url: "" };
        break;
      case PkiAlertChannelTypeV2.SLACK:
        config = { webhookUrl: "" };
        break;
      case PkiAlertChannelTypeV2.PAGERDUTY:
        config = { integrationKey: "" };
        break;
      default:
        config = { recipients: [] };
    }

    prependChannel({
      channelType: type,
      config,
      enabled: true
    });
    clearErrors("channels");
  };

  // Auto-expand newly added channel (prepended at index 0)
  useEffect(() => {
    if (justAddedRef.current && channelFields[0]?.id) {
      setExpandedChannel(channelFields[0].id);
      justAddedRef.current = false;
    }
  }, [channelFields[0]?.id, setExpandedChannel]);

  // Convert index-based expandedChannel (from modal validation) to field.id
  useEffect(() => {
    if (expandedChannel?.startsWith("channel-")) {
      const match = expandedChannel.match(/^channel-(\d+)$/);
      if (match) {
        const index = parseInt(match[1], 10);
        const fieldId = channelFields[index]?.id;
        if (fieldId) {
          setExpandedChannel(fieldId);
        }
      }
    }
  }, [expandedChannel, channelFields, setExpandedChannel]);

  /**
   * Sends a test request to the webhook URL to verify connectivity.
   *
   * Validates URL format client-side before making the API call.
   * The backend sends a test payload and reports success/failure,
   * which we display inline next to the test button.
   */
  const handleTestWebhook = async (fieldId: string, index: number) => {
    if (!currentProject?.id) return;

    // Trigger validation on the URL field - this will show Zod errors (invalid URL, non-HTTPS, etc.)
    const isValid = await trigger(`channels.${index}.config.url`);
    if (!isValid) return;

    const channel = watchedChannels[index];
    const webhookConfig = channel.config as TPkiAlertChannelConfigWebhook;

    setChannelUIStates((prev) => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], webhookTest: { success: null, isLoading: true } }
    }));

    try {
      const result = await testWebhookConfig({
        projectId: currentProject.id,
        url: webhookConfig.url,
        signingSecret: webhookConfig.signingSecret || undefined
      });

      if (result.success) {
        setChannelUIStates((prev) => ({
          ...prev,
          [fieldId]: { ...prev[fieldId], webhookTest: { success: true, isLoading: false } }
        }));
      } else {
        setChannelUIStates((prev) => ({
          ...prev,
          [fieldId]: {
            ...prev[fieldId],
            webhookTest: {
              success: false,
              error: result.error || "Failed to send test notification",
              isLoading: false
            }
          }
        }));
      }
    } catch {
      setChannelUIStates((prev) => ({
        ...prev,
        [fieldId]: {
          ...prev[fieldId],
          webhookTest: {
            success: false,
            error: "Failed to send test notification",
            isLoading: false
          }
        }
      }));
    }
  };

  const deleteChannel = (fieldId: string, index: number, e: React.MouseEvent) => {
    e.stopPropagation();

    removeChannel(index);

    // Clean up unified channel state
    setChannelUIStates((prev) => {
      const newStates = { ...prev };
      delete newStates[fieldId];
      return newStates;
    });

    if (expandedChannel === fieldId) {
      setExpandedChannel(undefined);
    }
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

  return (
    <>
      <Tab.Panel>
        <div className="space-y-6">
          <p className="mb-4 text-sm text-bunker-300">
            Choose the event type and configure basic details for your alert.
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

          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Alert Name" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="e.g., tls-expiry-alert" />
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

          {watchedEventType === PkiAlertEventTypeV2.EXPIRATION && (
            <Controller
              control={control}
              name="notificationConfig.enableDailyNotification"
              render={({ field }) => (
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-bunker-300">
                      Daily Alerts
                    </span>
                    <p className="text-xs text-bunker-400">
                      Send notifications daily from the alert threshold until expiry
                    </p>
                  </div>
                  <Switch
                    id="daily-alerts"
                    isChecked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
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
        <div className="flex min-h-[400px] flex-col gap-6">
          <div className="flex items-center justify-end gap-3">
            {isChannelLimitReached && (
              <span className="text-xs text-mineshaft-400">
                Maximum of {MAX_CHANNELS} channels reached
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild disabled={isChannelLimitReached}>
                <Button
                  type="button"
                  variant="outline_bg"
                  size="sm"
                  disabled={isChannelLimitReached}
                  rightIcon={<FontAwesomeIcon icon={faChevronDown} className="ml-1" />}
                >
                  Add Channel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem onClick={() => addChannel(PkiAlertChannelTypeV2.EMAIL)}>
                  <FontAwesomeIcon icon={faEnvelope} className="mr-2" />
                  Email
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addChannel(PkiAlertChannelTypeV2.WEBHOOK)}>
                  <FontAwesomeIcon icon={faLink} className="mr-2" />
                  Webhook
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addChannel(PkiAlertChannelTypeV2.SLACK)}>
                  <FontAwesomeIcon icon={faSlack} className="mr-2" />
                  Slack
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addChannel(PkiAlertChannelTypeV2.PAGERDUTY)}>
                  <FontAwesomeIcon icon={faBell} className="mr-2" />
                  PagerDuty
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {channelFields.length > 0 && (
            <Accordion
              type="single"
              collapsible
              value={expandedChannel}
              onValueChange={setExpandedChannel}
              className="border-mineshaft-500 bg-mineshaft-600"
            >
              {channelFields.map((field, index) => {
                const channel = watchedChannels[index];
                const channelError = errors.channels?.[index];
                return (
                  <AccordionItem key={field.id} value={field.id} className="border-mineshaft-600">
                    <AccordionTrigger className="group overflow-hidden bg-mineshaft-800 hover:bg-mineshaft-600 data-[state=open]:bg-mineshaft-700 data-[state=open]:hover:bg-mineshaft-600">
                      <div className="flex w-0 flex-1 items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <FontAwesomeIcon
                            icon={getChannelIcon(channel?.channelType)}
                            className="shrink-0 text-mineshaft-300"
                          />
                          <span className="shrink-0 text-sm font-medium">
                            {channel?.channelType && getChannelDisplayName(channel.channelType)}
                          </span>
                          <span className="truncate text-xs text-mineshaft-400 group-data-[state=open]:hidden">
                            {channel && getChannelSummary(channel)}
                          </span>
                        </div>
                        <div
                          role="presentation"
                          className="flex shrink-0 items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Controller
                            control={control}
                            name={`channels.${index}.enabled`}
                            render={({ field: enabledField }) => (
                              <Switch
                                id={`channel-enabled-${index}`}
                                isChecked={enabledField.value}
                                onCheckedChange={(checked) => {
                                  enabledField.onChange(checked);
                                  trigger("channels");
                                }}
                              />
                            )}
                          />
                          <IconButton
                            size="sm"
                            variant="plain"
                            colorSchema="danger"
                            ariaLabel="Delete channel"
                            onClick={(e) => deleteChannel(field.id, index, e)}
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </IconButton>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-mineshaft-800">
                      {channel?.channelType === PkiAlertChannelTypeV2.EMAIL && (
                        <Controller
                          control={control}
                          name={`channels.${index}.config.recipients`}
                          render={({ field: recipientsField, fieldState: { error } }) => (
                            <FormControl
                              label="Email Recipients"
                              helperText="Enter email addresses separated by commas"
                              isError={Boolean(error || channelError?.config)}
                              errorText={
                                error?.message ||
                                (channelError?.config as { message?: string })?.message
                              }
                            >
                              <TextArea
                                value={
                                  channelUIStates[field.id]?.emailInput !== undefined
                                    ? channelUIStates[field.id].emailInput
                                    : recipientsField.value?.join(", ") || ""
                                }
                                onChange={(e) => {
                                  // Store raw text while typing - don't parse yet
                                  setChannelUIStates((prev) => ({
                                    ...prev,
                                    [field.id]: { ...prev[field.id], emailInput: e.target.value }
                                  }));
                                }}
                                onBlur={() => {
                                  // Parse to array only on blur
                                  const rawValue = channelUIStates[field.id]?.emailInput;
                                  if (rawValue !== undefined) {
                                    const emails = rawValue
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean);
                                    recipientsField.onChange(emails);
                                  }
                                  recipientsField.onBlur();
                                }}
                                placeholder="admin@example.com, security@example.com"
                                rows={2}
                              />
                            </FormControl>
                          )}
                        />
                      )}

                      {channel?.channelType === PkiAlertChannelTypeV2.WEBHOOK && (
                        <div className="space-y-4">
                          <Controller
                            control={control}
                            name={`channels.${index}.config.url`}
                            render={({ field: urlField, fieldState: { error } }) => (
                              <FormControl
                                label="Webhook URL"
                                isRequired
                                isError={Boolean(error)}
                                errorText={error?.message}
                              >
                                <Input
                                  value={urlField.value || ""}
                                  onChange={urlField.onChange}
                                  onBlur={urlField.onBlur}
                                  placeholder="https://api.example.com/webhook"
                                />
                              </FormControl>
                            )}
                          />
                          <Controller
                            control={control}
                            name={`channels.${index}.config.signingSecret`}
                            render={({ field: secretField }) => (
                              <FormControl
                                label="Signing Secret"
                                tooltipText="Adding a signing secret enables webhook signature verification, helping ensure requests are genuinely from Infisical. The signature is sent via the x-infisical-signature header."
                              >
                                <Input
                                  type="password"
                                  value={secretField.value || ""}
                                  onChange={secretField.onChange}
                                  onBlur={secretField.onBlur}
                                  placeholder="Enter signing secret..."
                                />
                              </FormControl>
                            )}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline_bg"
                              size="sm"
                              onClick={() => handleTestWebhook(field.id, index)}
                              isLoading={channelUIStates[field.id]?.webhookTest?.isLoading}
                              isDisabled={channelUIStates[field.id]?.webhookTest?.isLoading}
                            >
                              Test
                            </Button>
                            {channelUIStates[field.id]?.webhookTest?.success === true && (
                              <span className="flex items-center gap-1 text-sm text-green-500">
                                <FontAwesomeIcon icon={faCheck} />
                                Success
                              </span>
                            )}
                            {channelUIStates[field.id]?.webhookTest?.success === false && (
                              <span className="flex items-center gap-1 text-sm text-red-500">
                                <FontAwesomeIcon icon={faXmark} />
                                {channelUIStates[field.id]?.webhookTest?.error || "Failed"}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {channel?.channelType === PkiAlertChannelTypeV2.SLACK && (
                        <Controller
                          control={control}
                          name={`channels.${index}.config.webhookUrl`}
                          render={({ field: urlField, fieldState: { error } }) => (
                            <FormControl
                              label="Slack Webhook URL"
                              isRequired
                              isError={Boolean(error)}
                              errorText={error?.message}
                              helperText="Create an Incoming Webhook in your Slack workspace settings"
                            >
                              <Input
                                value={urlField.value || ""}
                                onChange={urlField.onChange}
                                onBlur={urlField.onBlur}
                                placeholder="https://hooks.slack.com/services/..."
                              />
                            </FormControl>
                          )}
                        />
                      )}

                      {channel?.channelType === PkiAlertChannelTypeV2.PAGERDUTY && (
                        <Controller
                          control={control}
                          name={`channels.${index}.config.integrationKey`}
                          render={({ field: keyField, fieldState: { error } }) => (
                            <FormControl
                              label="Integration Key"
                              isRequired
                              isError={Boolean(error)}
                              errorText={error?.message}
                              helperText="Find this in PagerDuty under Services → Integrations → Events API v2"
                            >
                              <Input
                                value={keyField.value || ""}
                                onChange={keyField.onChange}
                                onBlur={keyField.onBlur}
                                placeholder="32-character hex integration key"
                              />
                            </FormControl>
                          )}
                        />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}

          {channelFields.length > 0 && errors.channels?.message && (
            <span className="text-sm text-red-500">{errors.channels.message}</span>
          )}

          {channelFields.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <span className="text-bunker-400">
                At least one notification channel is required. Click &quot;Add Channel&quot; to add
                one.
              </span>
              {errors.channels?.message && (
                <span className="text-sm text-red-500">{errors.channels.message}</span>
              )}
            </div>
          )}
        </div>
      </Tab.Panel>

      <Tab.Panel>
        <div className="mb-4 flex flex-col gap-6">
          <p className="text-sm text-bunker-300">
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
              {watchedEventType === PkiAlertEventTypeV2.EXPIRATION && (
                <GenericFieldLabel label="Daily Alerts">
                  {watch("notificationConfig.enableDailyNotification") ? "Enabled" : "Disabled"}
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
              <span className="text-sm text-mineshaft-300">Notification Channels</span>
            </div>
            {watchedChannels.length > 0 ? (
              <div className="space-y-2">
                {watchedChannels.map((channel, index) => (
                  <div
                    key={`review-channel-${index}`}
                    className="flex items-center gap-3 rounded-md border border-mineshaft-600 px-3 py-2"
                  >
                    <FontAwesomeIcon
                      icon={getChannelIcon(channel.channelType)}
                      className="text-mineshaft-400"
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-mineshaft-100">
                          {getChannelDisplayName(channel.channelType)}
                        </span>
                        {channel.channelType === PkiAlertChannelTypeV2.WEBHOOK &&
                          ((channel.config as TPkiAlertChannelConfigWebhook).signingSecret ? (
                            <Tooltip content="Signed webhook - requests will include signature verification">
                              <FontAwesomeIcon
                                icon={faKey}
                                className="text-xs text-mineshaft-400"
                              />
                            </Tooltip>
                          ) : (
                            <Tooltip content="Unsigned webhook - consider adding a signing secret for security">
                              <FontAwesomeIcon
                                icon={faTriangleExclamation}
                                className="text-xs text-mineshaft-400"
                              />
                            </Tooltip>
                          ))}
                      </div>
                      <span className="truncate text-xs text-mineshaft-400">
                        {(() => {
                          if (channel.channelType === PkiAlertChannelTypeV2.EMAIL) {
                            const config = channel.config as TPkiAlertChannelConfigEmail;
                            const count = config.recipients.length;
                            if (count === 0) return "No recipients";
                            const displayEmails = config.recipients.slice(0, 3);
                            const truncated = displayEmails.map((e) =>
                              e.length > 20 ? `${e.slice(0, 20)}...` : e
                            );
                            const displayText =
                              count <= 3
                                ? truncated.join(", ")
                                : `${truncated.join(", ")} +${count - 3} more`;

                            if (count > 3) {
                              return (
                                <Tooltip content={config.recipients.join(", ")}>
                                  <span className="cursor-help">{displayText}</span>
                                </Tooltip>
                              );
                            }
                            return displayText;
                          }
                          if (channel.channelType === PkiAlertChannelTypeV2.WEBHOOK) {
                            const config = channel.config as TPkiAlertChannelConfigWebhook;
                            try {
                              const url = new URL(config.url);
                              return url.hostname;
                            } catch {
                              return config.url || "Not configured";
                            }
                          }
                          if (channel.channelType === PkiAlertChannelTypeV2.SLACK) {
                            const config = channel.config as TPkiAlertChannelConfigSlack;
                            return config.webhookUrl
                              ? "Slack webhook configured"
                              : "Not configured";
                          }
                          if (channel.channelType === PkiAlertChannelTypeV2.PAGERDUTY) {
                            return "PagerDuty integration configured";
                          }
                          return "";
                        })()}
                      </span>
                    </div>
                    {!channel.enabled && (
                      <Badge variant="neutral" className="text-xs">
                        Disabled
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-red-400">
                No channels configured - at least one is required
              </span>
            )}
          </div>
        </div>
      </Tab.Panel>
    </>
  );
};
