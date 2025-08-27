import { faEye, faEyeSlash, faInfoCircle, faRotate } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, TableContainer, Tag, Td, Tooltip, Tr } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import { useToggle } from "@app/hooks";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";

import { EnvironmentStatusCell, ResourceNameCell } from "../shared";

type Props = {
  secretRotationName: string;
  environments: { name: string; slug: string }[];
  isSecretRotationInEnv: (name: string, env: string) => boolean;
  getSecretRotationByName: (slug: string, name: string) => TSecretRotationV2 | undefined;
  colWidth: number;
  tableWidth: number;
};

export const SecretRotationRow = ({
  secretRotationName,
  environments = [],
  isSecretRotationInEnv,
  colWidth,
  getSecretRotationByName,
  tableWidth
}: Props) => {
  const [isExpanded, setIsExpanded] = useToggle(false);
  const [isSecretVisible, setIsSecretVisible] = useToggle();

  const totalCols = environments.length + 1; // secret key row

  return (
    <>
      <Tr isHoverable isSelectable onClick={setIsExpanded.toggle} className="group">
        <ResourceNameCell
          label={secretRotationName}
          icon={faRotate}
          colWidth={colWidth}
          iconClassName="text-mineshaft-400"
          isRowExpanded={isExpanded}
        />
        {environments.map(({ slug }, i) => {
          const isPresent = isSecretRotationInEnv(secretRotationName, slug);

          return (
            <EnvironmentStatusCell
              isLast={i === environments.length - 1}
              status={isPresent ? "present" : "missing"}
              key={`secret-rotation-${slug}-${i + 1}-value`}
            />
          );
        })}
      </Tr>
      {isExpanded &&
        environments.map(({ name: envName, slug }) => {
          const secretRotation = getSecretRotationByName(slug, secretRotationName);

          if (!secretRotation) return null;

          const { type, secrets, description } = secretRotation;

          const { name: rotationType, image } = SECRET_ROTATION_MAP[type];

          return (
            <Tr key={`secret-rotation-${slug}-${secretRotationName}`} className="border-b-0">
              <Td
                colSpan={totalCols}
                style={{ minWidth: tableWidth, maxWidth: tableWidth }}
                className="sticky left-0 bg-mineshaft-800 bg-clip-padding px-0 py-0"
              >
                <div
                  style={{ minWidth: tableWidth, maxWidth: tableWidth }}
                  className="sticky left-0 bg-mineshaft-800 bg-clip-padding px-0 py-0"
                >
                  <div className="flex !h-[40px] items-center justify-between gap-x-2 px-4">
                    <div className="w-full">
                      <div className="flex w-full flex-wrap items-center gap-x-2.5">
                        <span>{envName}</span>
                        <Tag className="flex items-center gap-1 px-1.5 py-0 text-xs normal-case">
                          <img
                            src={`/images/integrations/${image}`}
                            className="w-[11px]"
                            alt={`${rotationType} logo`}
                          />
                          {rotationType}
                        </Tag>
                        {description && (
                          <Tooltip content={description}>
                            <FontAwesomeIcon icon={faInfoCircle} className="text-mineshaft-400" />
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="plain"
                      colorSchema="secondary"
                      leftIcon={<FontAwesomeIcon icon={isSecretVisible ? faEyeSlash : faEye} />}
                      onClick={() => setIsSecretVisible.toggle()}
                    >
                      {isSecretVisible ? "Hide Values" : "Reveal Values"}
                    </Button>
                  </div>
                  <TableContainer className="rounded-none border-0">
                    <table className="secret-table w-full border-b-0">
                      <tbody className="!last:border-b-0 w-full border-t-2 border-mineshaft-600">
                        {secrets.map((secret, index) => {
                          return (
                            <Tooltip
                              className="max-w-sm"
                              content={
                                secret
                                  ? undefined
                                  : "You do not have permission to view this secret."
                              }
                              // eslint-disable-next-line react/no-array-index-key
                              key={`rotation-secret-${secretRotation.id}-${index}`}
                            >
                              <tr className="hover:bg-mineshaft-700/70">
                                <td
                                  style={{
                                    width: colWidth
                                  }}
                                  className="!h-[1px] border-none !p-0"
                                >
                                  <div
                                    className="flex h-full flex-1 items-center border-r border-mineshaft-500 px-4 py-1"
                                    style={{
                                      width: colWidth
                                    }}
                                  >
                                    <span className={twMerge(!secret && "blur", "truncate")}>
                                      {secret?.key ?? "********"}
                                    </span>
                                  </div>
                                </td>
                                <td className="!h-[40px] !px-4">
                                  {/* eslint-disable-next-line no-nested-ternary */}
                                  {!secret ? (
                                    <div className="h-full pl-4 blur">********</div>
                                  ) : secret.secretValueHidden ? (
                                    <Blur
                                      className="py-0"
                                      tooltipText="You do not have permission to read the value of this secret."
                                    />
                                  ) : (
                                    <InfisicalSecretInput
                                      isReadOnly
                                      value={secret.value}
                                      isVisible={isSecretVisible}
                                      secretPath={secretRotation.folder.path}
                                      environment={secretRotation.environment.slug}
                                      onChange={() => {}}
                                    />
                                  )}
                                </td>
                              </tr>
                            </Tooltip>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableContainer>
                </div>
              </Td>
            </Tr>
          );
        })}
    </>
  );
};
