import { Helmet } from "react-helmet";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  PageHeader,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useGetAutomatedSecurityReports,
  usePatchSecurityReportStatus
} from "@app/hooks/api/automated-security";

export const AutomatedSecurityPage = () => {
  const { currentOrg } = useOrganization();
  const { data: reportEntries } = useGetAutomatedSecurityReports(currentOrg.id);
  const { mutateAsync: patchSecurityReportStatus } = usePatchSecurityReportStatus(currentOrg.id);

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>Infisical | Automated Security</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader
            title="Automated Security"
            description="Your organization's reliable AI security guard"
          />
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>Identity ID</Th>
                  <Th>Name</Th>
                  <Th>Event</Th>
                  <Th>Remarks</Th>
                  <Th>Severity</Th>
                  <Th />
                </Tr>
              </THead>
              <TBody>
                {(reportEntries ?? []).map((entry) => (
                  <Tr>
                    <Td>{entry.userId}</Td>
                    <Td>{entry.name}</Td>
                    <Td>{JSON.stringify(entry.event, null, 2)}</Td>
                    <Td>{entry.remarks}</Td>
                    <Td>{entry.severity}</Td>
                    <Td>
                      <Button
                        className="mb-4 w-[5rem]"
                        onClick={async () => {
                          await patchSecurityReportStatus({
                            id: entry.id,
                            status: "resolved"
                          });

                          createNotification({
                            type: "success",
                            text: "Successfully resolved security report"
                          });
                        }}
                      >
                        Resolve
                      </Button>
                      <Button
                        colorSchema="secondary"
                        className="w-[5rem]"
                        onClick={async () => {
                          await patchSecurityReportStatus({
                            id: entry.id,
                            status: "ignored"
                          });

                          createNotification({
                            type: "success",
                            text: "Successfully ignored security report"
                          });
                        }}
                      >
                        Ignore
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </div>
      </div>
    </div>
  );
};
