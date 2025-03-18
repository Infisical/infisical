import { faCheck, faFileImport, faKey, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { EmptyState, SecretInput, TableContainer, Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { TSecretImportMultiEnvData } from "@app/hooks/api/secretImports/types";
import { EnvFolderIcon } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretImportListView/SecretImportItem";
import { computeImportedSecretRows } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretImportListView/SecretImportListView";

type Props = {
  secretImport: TSecretImportMultiEnvData;
  environments: { name: string; slug: string }[];
  isImportedSecretPresentInEnv: (
    sourceEnv: string,
    targetEnv: string,
    secretPath: string
  ) => boolean;
  scrollOffset: number;
  allSecretImports: TSecretImportMultiEnvData[];
};

export const SecretOverviewImportListView = ({
  secretImport,
  environments = [],
  isImportedSecretPresentInEnv,
  scrollOffset,
  allSecretImports = []
}: Props) => {
  const [isFormExpanded, setIsFormExpanded] = useToggle();
  const environmentImportDetails = secretImport.environmentInfo;
  const totalCols = environments.length + 1;

  const computeImportedSecrets =
    allSecretImports.length > 0
      ? computeImportedSecretRows(
          environmentImportDetails.slug,
          secretImport.secretPath,
          allSecretImports
        )
      : [];
  return (
    <>
      <Tr
        isHoverable
        isSelectable
        onClick={() => setIsFormExpanded.toggle()}
        className={`group ${isFormExpanded ? "border-t-2 border-mineshaft-500" : ""}`}
      >
        <Td className="sticky left-0 z-10 bg-mineshaft-800 bg-clip-padding px-0 py-0 group-hover:bg-mineshaft-700">
          <div className="group flex cursor-pointer">
            <div className="flex w-11 items-center py-2 pl-5 text-green-700">
              <FontAwesomeIcon icon={faFileImport} />
            </div>
            <div className="flex flex-grow items-center py-2 pl-4 pr-2">
              <EnvFolderIcon
                env={environmentImportDetails.slug || ""}
                secretPath={secretImport.secretPath || ""}
              />
            </div>
          </div>
        </Td>
        {environments.map(({ slug }, i) => {
          const isPresent = isImportedSecretPresentInEnv(
            slug,
            secretImport.environment,
            secretImport.secretPath
          );

          return (
            <Td
              key={`sec-overview-${slug}-${i + 1}-value`}
              className={twMerge(
                "px-0 py-0 group-hover:bg-mineshaft-700",
                isPresent ? "text-green-600" : "text-red-600"
              )}
            >
              <div className="h-full w-full border-r border-mineshaft-600 px-5 py-[0.85rem]">
                <div className="flex justify-center">
                  <FontAwesomeIcon
                    // eslint-disable-next-line no-nested-ternary
                    icon={
                      isImportedSecretPresentInEnv(
                        slug,
                        secretImport.environment,
                        secretImport.secretPath
                      )
                        ? faCheck
                        : faXmark
                    }
                  />
                </div>
              </div>
            </Td>
          );
        })}
      </Tr>
      {isFormExpanded && (
        <Tr>
          <Td
            colSpan={totalCols}
            className={`bg-bunker-600 px-0 py-0 ${
              isFormExpanded && "border-b-2 border-mineshaft-500"
            }`}
          >
            <div
              className="ml-2 p-2"
              style={{
                marginLeft: scrollOffset,
                width: "100%"
              }}
            >
              <TableContainer>
                <table className="secret-table">
                  <thead>
                    <tr>
                      <td style={{ padding: "0.25rem 1rem" }}>Key</td>
                      <td style={{ padding: "0.25rem 1rem" }}>Value</td>
                      {/* <td style={{ padding: "0.25rem 1rem" }}>Override</td> */}
                    </tr>
                  </thead>
                  <tbody>
                    {computeImportedSecrets?.length === 0 && (
                      <tr>
                        <td colSpan={3}>
                          <EmptyState title="No secrets found" icon={faKey} />
                        </td>
                      </tr>
                    )}
                    {computeImportedSecrets.map(({ key, value }, index) => (
                      <tr key={`${key}-${index + 1}`}>
                        <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                          {key}
                        </td>
                        <td className="h-10" style={{ padding: "0.25rem 1rem" }}>
                          <SecretInput value={value} isReadOnly />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            </div>
          </Td>
        </Tr>
      )}
    </>
  );
};
