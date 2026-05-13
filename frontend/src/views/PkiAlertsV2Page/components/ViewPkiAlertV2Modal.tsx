import { useEffect, useState } from "react";
import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { CertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import {
  GenericFieldLabel,
  Modal,
  ModalContent,
  Pagination,
  Skeleton,
  Table,
  TableContainer,
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

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

const SectionHeader = ({ title }: { title: string }) => (
  <h3 className="border-b border-mineshaft-700 pb-2 text-sm font-semibold text-mineshaft-100">
    {title}
  </h3>
);

export const ViewPkiAlertV2Modal = ({ isOpen, onOpenChange, alertId }: Props) => {
  const [certificatesPage, setCertificatesPage] = useState(1);
  const certificatesPerPage = 10;

  const { data: alert, isLoading: isLoadingAlert } = useGetPkiAlertV2ById(
    { alertId: alertId || "" },
    { enabled: !!alertId && isOpen }
  );

  const showMatchingCertificates =
    alert?.eventType && alert.eventType !== PkiAlertEventTypeV2.ISSUANCE;

  const { data: certificatesData, isLoading: isLoadingCertificates } =
    useGetPkiAlertV2MatchingCertificates(
      {
        alertId: alertId || "",
        limit: certificatesPerPage,
        offset: (certificatesPage - 1) * certificatesPerPage
      },
      { enabled: !!alertId && isOpen && !!showMatchingCertificates }
    );

  useEffect(() => {
    if (!isOpen) setCertificatesPage(1);
  }, [isOpen]);

  if (isLoadingAlert) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent title="Certificate Alert Details" className="max-w-3xl">
          <div className="space-y-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </ModalContent>
      </Modal>
    );
  }

  if (!alert) {
    return (
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent title="Certificate Alert Details" className="max-w-3xl">
          <p className="py-8 text-center text-sm text-mineshaft-400">Alert not found.</p>
        </ModalContent>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Certificate Alert Details"
        className={showMatchingCertificates ? "max-w-5xl" : "max-w-3xl"}
      >
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-mineshaft-100">{alert.name}</p>
              {alert.description && (
                <p className="mt-1 text-sm text-mineshaft-400">{alert.description}</p>
              )}
            </div>
            <Badge variant={alert.enabled ? "success" : "neutral"}>
              {alert.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Basic Information" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
              <GenericFieldLabel label="Event Type">
                {formatEventType(alert.eventType)}
              </GenericFieldLabel>
              {alert.eventType === PkiAlertEventTypeV2.EXPIRATION && (
                <>
                  <GenericFieldLabel label="Alert Before">
                    {formatAlertBefore(alert.alertBefore, undefined)}
                  </GenericFieldLabel>
                  <GenericFieldLabel label="Repeat daily until expiry">
                    {alert.notificationConfig?.enableDailyNotification ? "Enabled" : "Disabled"}
                  </GenericFieldLabel>
                </>
              )}
              <GenericFieldLabel label="Created">{formatDate(alert.createdAt)}</GenericFieldLabel>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Filter Rules" />
            {(alert.filters || []).length === 0 ? (
              <p className="text-sm text-mineshaft-400/70 italic">No filter rules configured.</p>
            ) : (
              <ul className="space-y-1.5">
                {(alert.filters || []).map((filter) => {
                  const field = filter.field.replace(/_/g, " ");
                  const operator = filter.operator.replace(/_/g, " ");
                  const value = Array.isArray(filter.value)
                    ? filter.value.join(", ")
                    : String(filter.value);
                  return (
                    <li
                      key={`filter-${filter.field}-${filter.operator}-${String(filter.value)}`}
                      className="text-sm text-mineshaft-100 capitalize"
                    >
                      {field} {operator} {value}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <SectionHeader title="Notification Channels" />
            {(alert.channels || []).length === 0 ? (
              <p className="text-sm text-mineshaft-400/70 italic">
                No notification channels configured.
              </p>
            ) : (
              <div className="space-y-2">
                {(alert.channels || []).map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-start gap-3 rounded-md border border-mineshaft-600 bg-mineshaft-800/40 p-3"
                  >
                    <FontAwesomeIcon
                      icon={getChannelIcon(channel.channelType)}
                      className="mt-0.5 shrink-0 text-mineshaft-400"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-mineshaft-100">
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
                        {!channel.enabled && <Badge variant="neutral">Disabled</Badge>}
                      </div>
                      {channel.channelType === PkiAlertChannelTypeV2.EMAIL &&
                        (() => {
                          const config = channel.config as TPkiAlertChannelConfigEmail;
                          const recipients = config?.recipients || [];
                          const count = recipients.length;
                          if (count === 0) {
                            return <p className="mt-1 text-xs text-mineshaft-400">No recipients</p>;
                          }
                          const displayed = recipients.slice(0, 3).join(", ");
                          const text = count <= 3 ? displayed : `${displayed} +${count - 3} more`;
                          return count > 3 ? (
                            <Tooltip content={recipients.join(", ")}>
                              <p className="mt-1 cursor-help text-xs text-mineshaft-400">{text}</p>
                            </Tooltip>
                          ) : (
                            <p className="mt-1 text-xs text-mineshaft-400">{text}</p>
                          );
                        })()}
                      {channel.channelType === PkiAlertChannelTypeV2.WEBHOOK && (
                        <p className="mt-1 truncate text-xs text-mineshaft-400">
                          {getWebhookHostname(
                            (channel.config as TPkiAlertChannelConfigWebhookResponse).url
                          )}
                        </p>
                      )}
                      {channel.channelType === PkiAlertChannelTypeV2.SLACK && (
                        <p className="mt-1 text-xs text-mineshaft-400">Slack webhook configured</p>
                      )}
                      {channel.channelType === PkiAlertChannelTypeV2.PAGERDUTY && (
                        <p className="mt-1 text-xs text-mineshaft-400">
                          PagerDuty integration configured
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showMatchingCertificates && (
            <div className="space-y-3">
              <SectionHeader title="Matching Certificates" />
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
                        return certificatesData.certificates.map((cert) => {
                          const now = new Date();
                          const isExpired = new Date(cert.notAfter) < now;
                          // eslint-disable-next-line no-nested-ternary
                          const statusVariant = isExpired
                            ? "danger"
                            : cert.status === "active"
                              ? "success"
                              : "neutral";
                          const statusLabel = isExpired ? "Expired" : cert.status;
                          return (
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
                                  {cert.enrollmentType === "ca" && <Badge variant="info">CA</Badge>}
                                </div>
                              </Td>
                              <Td>
                                <Badge variant={statusVariant} className="capitalize">
                                  {statusLabel}
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
                          );
                        });
                      }
                      return (
                        <Tr>
                          <Td colSpan={4} className="py-6 text-center text-sm text-mineshaft-400">
                            No certificates currently match this alert&apos;s criteria.
                          </Td>
                        </Tr>
                      );
                    })()}
                  </TBody>
                </Table>
              </TableContainer>
              {(certificatesData?.total || 0) > certificatesPerPage && (
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
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};
