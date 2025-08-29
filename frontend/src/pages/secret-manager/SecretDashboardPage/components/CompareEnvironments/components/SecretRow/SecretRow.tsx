import { subject } from "@casl/ability";
import {
  faCodeBranch,
  faEye,
  faEyeSlash,
  faFileImport,
  faKey,
  faRotate
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, TableContainer, Td, Tooltip, Tr } from "@app/components/v2";
import { useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useToggle } from "@app/hooks";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { WorkspaceEnv } from "@app/hooks/api/types";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

import { EnvironmentStatus, EnvironmentStatusCell, ResourceNameCell } from "../shared";
import { EnvironmentSecretRow } from "./EnvironmentSecretRow";

type Props = {
  secretKey: string;
  secretPath: string;
  environments: { name: string; slug: string }[];
  getSecretByKey: (slug: string, key: string) => SecretV3RawSanitized | undefined;
  isImportedSecretPresentInEnv: (env: string, secretName: string) => boolean;
  getImportedSecretByKey: (
    env: string,
    secretName: string
  ) => { secret?: SecretV3RawSanitized; environmentInfo?: WorkspaceEnv } | undefined;
  colWidth: number;
  tableWidth: number;
};

export const SecretRow = ({
  secretKey,
  environments = [],
  secretPath,
  getSecretByKey,
  isImportedSecretPresentInEnv,
  getImportedSecretByKey,
  colWidth,
  tableWidth
}: Props) => {
  const [isFormExpanded, setIsFormExpanded] = useToggle();
  const totalCols = environments.length + 1; // secret key row
  const [isSecretVisible, setIsSecretVisible] = useToggle();

  const { permission } = useProjectPermission();

  const getDefaultValue = (
    secret: SecretV3RawSanitized | undefined,
    importedSecret: { secret?: SecretV3RawSanitized } | undefined
  ) => {
    const canEditSecretValue = permission.can(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment: secret?.env || "",
        secretPath: secret?.path || "",
        secretName: secret?.key || "",
        secretTags: ["*"]
      })
    );

    if (secret?.secretValueHidden && !secret?.valueOverride) {
      return canEditSecretValue ? HIDDEN_SECRET_VALUE : "";
    }
    return secret?.valueOverride || secret?.value || importedSecret?.secret?.value || "";
  };

  return (
    <>
      <Tr
        isHoverable
        isSelectable
        onClick={() => setIsFormExpanded.toggle()}
        className="group border-mineshaft-500"
      >
        <ResourceNameCell
          colWidth={colWidth}
          label={secretKey}
          icon={faKey}
          iconClassName="text-bunker-300"
          isRowExpanded={isFormExpanded}
        />
        {environments.map(({ slug }, i) => {
          const secret = getSecretByKey(slug, secretKey);

          const isSecretImported = isImportedSecretPresentInEnv(slug, secretKey);

          const isSecretPresent = Boolean(secret);
          const isSecretEmpty = secret?.value === "";

          let status: EnvironmentStatus;

          if (isSecretEmpty) {
            status = "empty";
          } else if (isSecretPresent) {
            status = "present";
          } else if (isSecretImported) {
            status = "imported";
          } else {
            status = "missing";
          }

          return (
            <EnvironmentStatusCell
              isLast={i === environments.length - 1}
              key={`sec-overview-${slug}-${i + 1}-value`}
              status={status}
            />
          );
        })}
      </Tr>
      {isFormExpanded && (
        <Tr className="border-b-0">
          <Td
            colSpan={totalCols}
            style={{ minWidth: tableWidth, maxWidth: tableWidth }}
            className="sticky left-0 bg-clip-padding px-0 py-0"
          >
            <div
              style={{ minWidth: tableWidth, maxWidth: tableWidth }}
              className="sticky left-0 bg-clip-padding px-0 py-0"
            >
              <TableContainer className="rounded-none border-0">
                <table className="secret-table bg-mineshaft-900">
                  <thead>
                    <tr className="h-10 border-b-2 border-mineshaft-600 bg-mineshaft-800">
                      <th
                        style={{
                          width: colWidth
                        }}
                        className="min-table-row"
                      >
                        <span className="truncate">Environment</span>
                      </th>
                      <th style={{ padding: "0.5rem 1rem" }} className="border-none">
                        Value
                      </th>
                      <div className="absolute right-3 top-[4px] ml-auto mr-1 mt-1 w-min">
                        <Tooltip
                          side="left"
                          content={isSecretVisible ? "Hide Values" : "Reveal Values"}
                        >
                          <IconButton
                            variant="plain"
                            colorSchema="secondary"
                            ariaLabel={isSecretVisible ? "Hide Values" : "Reveal Values"}
                            onClick={() => setIsSecretVisible.toggle()}
                          >
                            <FontAwesomeIcon icon={isSecretVisible ? faEyeSlash : faEye} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </tr>
                  </thead>
                  <tbody className="border-t-2 border-mineshaft-600">
                    {environments.map(({ name, slug }) => {
                      const secret = getSecretByKey(slug, secretKey);

                      const isImportedSecret = isImportedSecretPresentInEnv(slug, secretKey);
                      const importedSecret = getImportedSecretByKey(slug, secretKey);

                      return (
                        <tr
                          key={`secret-expanded-${slug}-${secretKey}`}
                          className="h-full hover:bg-mineshaft-700/70"
                        >
                          <td
                            className="h-[1px] border-none !p-0"
                            style={{
                              width: colWidth
                            }}
                          >
                            <div
                              title={name}
                              style={{
                                width: colWidth
                              }}
                              className="flex h-full min-h-[40px] w-[8rem] items-center space-x-2 border-r border-mineshaft-500 px-4"
                            >
                              <span className="truncate">{name}</span>
                              {isImportedSecret && (
                                <Tooltip
                                  content={`Imported secret from the '${importedSecret?.environmentInfo?.name}' environment`}
                                >
                                  <FontAwesomeIcon icon={faFileImport} />
                                </Tooltip>
                              )}
                              {secret?.isRotatedSecret && (
                                <Tooltip content="Rotated Secret">
                                  <FontAwesomeIcon icon={faRotate} />
                                </Tooltip>
                              )}
                              {secret?.valueOverride && (
                                <Tooltip content="Personal Override">
                                  <FontAwesomeIcon icon={faCodeBranch} />
                                </Tooltip>
                              )}
                            </div>
                          </td>
                          <td className="col-span-2 h-8 w-full">
                            <EnvironmentSecretRow
                              secretPath={secretPath}
                              isVisible={isSecretVisible}
                              secretValueHidden={secret?.secretValueHidden || false}
                              defaultValue={getDefaultValue(secret, importedSecret)}
                              isOverride={Boolean(secret?.valueOverride)}
                              isImportedSecret={isImportedSecret}
                              environment={slug}
                            />
                          </td>
                        </tr>
                      );
                    })}
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
