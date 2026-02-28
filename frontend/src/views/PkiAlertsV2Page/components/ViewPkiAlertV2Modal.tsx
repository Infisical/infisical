import { useEffect, useState } from "react";
import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { CertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import {
  Modal,
  ModalContent,
  Pagination,
  Skeleton,
  Tab,
  Table,
  TableContainer,
  TabList,
  TabPanel,
  Tabs,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  PkiAlertChannelTypeV2,
  PkiAlertEventTypeV2,
  TPkiAlertChannelConfigEmail,
  TPkiAlertChannelConfigWebhookResponse,
  useGetPkiAlertV2ById,
  useGetPkiAlertV2MatchingCertificates
} from "@app/hooks/api/pkiAlertsV2";

import {
  formatAlertBefore,
  formatEventType,
  getChannelDisplayName,
  getChannelIcon,
  getWebhookHostname
} from "../utils/pki-alert-formatters";

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  alertId?: string;
}

export const ViewPkiAlertV2Modal = ({ isOpen, onOpenChange, alertId }: Props) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [certificatesPage, setCertificatesPage] = useState(1);
  const certificatesPerPage = 10;

  const { data: alert, isLoading: isLoadingAlert } = useGetPkiAlertV2ById(
    { alertId: alertId || "" },
    { enabled: !!alertId && isOpen }
  );

  const { data: certificatesData, isLoading: isLoadingCertificates } =
    useGetPkiAlertV2MatchingCertificates(
      {
        alertId: alertId || "",
        limit: certificatesPerPage,
        offset: (certificatesPage - 1) * certificatesPerPage
      },
      { enabled: !!alertId && isOpen }
    );

  useEffect(() => {
    if (isOpen && alertId) {
      setActiveTab("overview");
      setCertificatesPage(1);
    }
  }, [isOpen, alertId]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("overview");
      setCertificatesPage(1);
    }
  }, [isOpen]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  if (isLoadingAlert) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent title="Certificate Alert Details" className="max-w-6xl">
          <div className="space-y-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </ModalContent>
      </Modal>
    );
  }

  if (!alert) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent title="Certificate Alert Details" className="max-w-6xl">
          <div className="py-8 text-center text-gray-400">Alert not found</div>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Certificate Alert Details" className="max-w-6xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-200">{alert.name}</h2>
            <Badge variant={alert.enabled ? "success" : "neutral"}>
              {alert.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          {alert.description && <p className="text-gray-300">{alert.description}</p>}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabList>
              <Tab value="overview">Overview</Tab>
              <Tab value="certificates">Matching Certificates</Tab>
            </TabList>

            <TabPanel value="overview">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-200">Basic Information</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <div className="mb-1 block text-sm font-medium text-gray-400">Event Type</div>
                      <span className="text-gray-300">{formatEventType(alert.eventType)}</span>
                    </div>

                    <div>
                      <div className="mb-1 block text-sm font-medium text-gray-400">
                        Alert Before
                      </div>
                      <span className="text-gray-300">
                        {formatAlertBefore(alert.alertBefore, "Not set")}
                      </span>
                    </div>

                    {alert.eventType === PkiAlertEventTypeV2.EXPIRATION && (
                      <div>
                        <div className="mb-1 block text-sm font-medium text-gray-400">
                          Daily Alerts
                        </div>
                        <span className="text-gray-300">
                          {alert.notificationConfig?.enableDailyNotification
                            ? "Enabled"
                            : "Disabled"}
                        </span>
                      </div>
                    )}

                    <div>
                      <div className="mb-1 block text-sm font-medium text-gray-400">Created</div>
                      <span className="text-gray-300">{formatDate(alert.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-gray-200">Filter Rules</h3>
                  {(alert.filters || []).length === 0 ? (
                    <p className="text-gray-400">No filter rules configured</p>
                  ) : (
                    <div className="space-y-2">
                      {(alert.filters || []).map((filter) => {
                        const formatFilterText = () => {
                          const field = filter.field.replace(/_/g, " ");
                          const operator = filter.operator.replace(/_/g, " ");
                          const value = Array.isArray(filter.value)
                            ? filter.value.join(", ")
                            : String(filter.value);

                          return `${field} ${operator} ${value}`;
                        };

                        return (
                          <div
                            key={`filter-${filter.field}-${filter.operator}-${String(filter.value)}`}
                          >
                            <div className="text-sm text-gray-200 capitalize">
                              {formatFilterText()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-medium text-gray-200">Notification Channels</h3>
                  {(alert.channels || []).length > 0 ? (
                    <div className="space-y-3">
                      {(alert.channels || []).map((channel) => (
                        <div
                          key={channel.id}
                          className="flex items-start gap-3 rounded-md border border-mineshaft-600 p-3"
                        >
                          <FontAwesomeIcon
                            icon={getChannelIcon(channel.channelType)}
                            className="mt-1 shrink-0 text-mineshaft-400"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-mineshaft-100">
                                {getChannelDisplayName(channel.channelType)}
                              </span>
                              {channel.channelType === PkiAlertChannelTypeV2.WEBHOOK &&
                                (channel.config as TPkiAlertChannelConfigWebhookResponse)
                                  ?.hasSigningSecret && (
                                  <Tooltip content="Signed webhook">
                                    <FontAwesomeIcon
                                      icon={faKey}
                                      className="text-xs text-mineshaft-400"
                                    />
                                  </Tooltip>
                                )}
                              {!channel.enabled && (
                                <Badge variant="neutral" className="text-xs">
                                  Disabled
                                </Badge>
                              )}
                            </div>
                            {channel.channelType === PkiAlertChannelTypeV2.EMAIL && (
                              <div className="mt-1 text-sm text-mineshaft-400">
                                {(() => {
                                  const config = channel.config as TPkiAlertChannelConfigEmail;
                                  const recipients = config?.recipients || [];
                                  const count = recipients.length;
                                  if (count === 0) return "No recipients";
                                  const displayEmails = recipients.slice(0, 3);
                                  const displayText =
                                    count <= 3
                                      ? displayEmails.join(", ")
                                      : `${displayEmails.join(", ")} +${count - 3} more`;

                                  if (count > 3) {
                                    return (
                                      <Tooltip content={recipients.join(", ")}>
                                        <span className="cursor-help">{displayText}</span>
                                      </Tooltip>
                                    );
                                  }
                                  return displayText;
                                })()}
                              </div>
                            )}
                            {channel.channelType === PkiAlertChannelTypeV2.WEBHOOK && (
                              <div className="mt-1 truncate text-sm text-mineshaft-400">
                                {getWebhookHostname(
                                  (channel.config as TPkiAlertChannelConfigWebhookResponse).url
                                )}
                              </div>
                            )}
                            {channel.channelType === PkiAlertChannelTypeV2.SLACK && (
                              <div className="mt-1 truncate text-sm text-mineshaft-400">
                                Slack webhook configured
                              </div>
                            )}
                            {channel.channelType === PkiAlertChannelTypeV2.PAGERDUTY && (
                              <div className="mt-1 truncate text-sm text-mineshaft-400">
                                PagerDuty integration configured
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400">No notification channels configured</p>
                  )}
                </div>
              </div>
            </TabPanel>

            <TabPanel value="certificates">
              <div className="space-y-4">
                <TableContainer>
                  <Table>
                    <THead>
                      <Tr>
                        <Th className="w-1/2">SAN / CN</Th>
                        <Th className="w-1/6">Status</Th>
                        <Th className="w-1/6">Not Before</Th>
                        <Th className="w-1/6">Not After</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {(() => {
                        if (isLoadingCertificates) {
                          return Array.from({ length: 5 }, (_, index) => (
                            <Tr key={`skeleton-row-${index}`}>
                              <Td>
                                <Skeleton className="h-4 w-32" />
                              </Td>
                              <Td>
                                <Skeleton className="h-4 w-16" />
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

                        if (certificatesData?.certificates?.length) {
                          return certificatesData.certificates.map((cert) => (
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
                                  {cert.enrollmentType === "ca" && (
                                    <Badge variant="info" className="shrink-0 text-xs">
                                      CA
                                    </Badge>
                                  )}
                                </div>
                              </Td>
                              <Td>
                                <Badge
                                  variant={(() => {
                                    const now = new Date();
                                    const expirationDate = new Date(cert.notAfter);
                                    const isExpired = expirationDate < now;

                                    if (isExpired) return "danger";
                                    if (cert.status === "active") return "success";
                                    return "neutral";
                                  })()}
                                  className="capitalize"
                                >
                                  {(() => {
                                    const now = new Date();
                                    const expirationDate = new Date(cert.notAfter);
                                    const isExpired = expirationDate < now;

                                    if (isExpired) return "Expired";
                                    return cert.status;
                                  })()}
                                </Badge>
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
                            <Td colSpan={4} className="py-8 text-center text-gray-400">
                              No certificates will match this alert&apos;s criteria in the future
                            </Td>
                          </Tr>
                        );
                      })()}
                    </TBody>
                  </Table>
                </TableContainer>

                {(certificatesData?.total || 0) > 0 && (
                  <div className="flex justify-center">
                    <Pagination
                      count={certificatesData?.total || 0}
                      page={certificatesPage}
                      onChangePage={setCertificatesPage}
                      perPage={certificatesPerPage}
                      onChangePerPage={() => {}}
                    />
                  </div>
                )}
              </div>
            </TabPanel>
          </Tabs>
        </div>
      </ModalContent>
    </Modal>
  );
};
