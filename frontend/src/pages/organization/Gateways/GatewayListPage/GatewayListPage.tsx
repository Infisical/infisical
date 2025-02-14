import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faMagnifyingGlass,
  faPlug,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import {
  EmptyState,
  Input,
  PageHeader,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways";

export const GatewayListPage = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const { data: gateways, isPending: isGatewayLoading } = useQuery(gatewaysQueryKeys.list());

    const filteredGateway = gateways?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="bg-bunker-800">
        <Helmet>
          <title>Infisical | Gateways</title>
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div className="flex w-full justify-center bg-bunker-800 text-white">
          <div className="w-full max-w-7xl">
            <PageHeader
              className="w-full"
              title={
                <div className="flex w-full items-center">
                  <span>Gateways</span>
                  <a
                    className="-mt-1.5"
                    href="https://infisical.com/docs/integrations/gateways/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ml-2 inline-block rounded-md bg-yellow/20 px-1.5 text-sm font-normal text-yellow opacity-80 hover:opacity-100">
                      <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                      <span>Docs</span>
                      <FontAwesomeIcon
                        icon={faArrowUpRightFromSquare}
                        className="mb-[0.07rem] ml-1.5 text-[10px]"
                      />
                    </div>
                  </a>
                </div>
              }
              description="Create and configure connections with third-party apps for re-use across Infisical projects"
            />
            <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
              <div>
                <div className="flex gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
                    placeholder="Search connections..."
                    className="flex-1"
                  />
                </div>
                <TableContainer className="mt-4">
                  <Table>
                    <THead>
                      <Tr>
                        <Th className="w-1/3">Name</Th>
                        <Th>Issued At</Th>
                        <Th>Identity</Th>
                        <Th className="w-5" />
                      </Tr>
                    </THead>
                    <TBody>
                      {isGatewayLoading && (
                        <TableSkeleton innerKey="gateway-table" columns={4} key="gateway-table" />
                      )}
                      {filteredGateway?.map((el) => (
                        <Tr key={el.id}>
                          <Td>{el.name}</Td>
                          <Td>{format(new Date(el.issuedAt), "yyyy-MM-dd")}</Td>
                          <Td>{el.identity.name}</Td>
                          <Td />
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                  {!isGatewayLoading && !filteredGateway?.length && (
                    <EmptyState
                      title={
                        gateways?.length
                          ? "No Gateways match search..."
                          : "No Gateways have been configured"
                      }
                      icon={gateways?.length ? faSearch : faPlug}
                    />
                  )}
                </TableContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
  {
    action: OrgPermissionAppConnectionActions.Read,
    subject: OrgPermissionSubjects.AppConnections
  }
);
