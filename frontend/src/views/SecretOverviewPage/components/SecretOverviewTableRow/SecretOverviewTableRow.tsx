import { faCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faAngleDown,
  faCheck,
  faEye,
  faEyeSlash,
  faFileImport,
  faKey,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, Checkbox, TableContainer, Td, Tooltip, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { DecryptedSecret, SecretType } from "@app/hooks/api/secrets/types";
import { WorkspaceEnv } from "@app/hooks/api/types";

import { SecretEditRow } from "./SecretEditRow";
import SecretRenameRow from "./SecretRenameRow";

type Props = {
  secretKey: string;
  secretPath: string;
  environments: { name: string; slug: string }[];
  expandableColWidth: number;
  isSelected: boolean;
  onToggleSecretSelect: (key: string) => void;
  getSecretByKey: (slug: string, key: string) => DecryptedSecret | undefined;
  onSecretCreate: (env: string, key: string, value: string) => Promise<void>;
  onSecretUpdate: (
    env: string,
    key: string,
    value: string,
    type?: SecretType,
    secretId?: string
  ) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string) => Promise<void>;
  isImportedSecretPresentInEnv: (env: string, secretName: string) => boolean;
  getImportedSecretByKey: (
    env: string,
    secretName: string
  ) => { secret?: DecryptedSecret; environmentInfo?: WorkspaceEnv } | undefined;
};

export const SecretOverviewTableRow = ({
  secretKey,
  environments = [],
  secretPath,
  getSecretByKey,
  onSecretUpdate,
  onSecretCreate,
  onSecretDelete,
  isImportedSecretPresentInEnv,
  getImportedSecretByKey,
  expandableColWidth,
  onToggleSecretSelect,
  isSelected
}: Props) => {
  const [isFormExpanded, setIsFormExpanded] = useToggle();
  const totalCols = environments.length + 1; // secret key row
  const [isSecretVisible, setIsSecretVisible] = useToggle();

  return (
    <>
      <Tr isHoverable isSelectable onClick={() => setIsFormExpanded.toggle()} className="group">
        <Td
          className={`sticky left-0 z-10 bg-mineshaft-800 bg-clip-padding py-0 px-0 group-hover:bg-mineshaft-700 ${
            isFormExpanded && "border-t-2 border-mineshaft-500"
          }`}
        >
          <div className="h-full w-full border-r border-mineshaft-600 py-2.5 px-5">
            <div className="flex items-center space-x-5">
              <div className="text-blue-300/70">
                <Checkbox
                  id={`checkbox-${secretKey}`}
                  isChecked={isSelected}
                  onCheckedChange={() => {
                    onToggleSecretSelect(secretKey);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className={twMerge("hidden group-hover:flex", isSelected && "flex")}
                />
                <FontAwesomeIcon
                  className={twMerge("block group-hover:hidden", isSelected && "hidden")}
                  icon={isFormExpanded ? faAngleDown : faKey}
                />
              </div>
              <div title={secretKey}>{secretKey}</div>
            </div>
          </div>
        </Td>
        {environments.map(({ slug }, i) => {
          const secret = getSecretByKey(slug, secretKey);

          const isSecretImported = isImportedSecretPresentInEnv(slug, secretKey);

          const isSecretPresent = Boolean(secret);
          const isSecretEmpty = secret?.value === "";
          return (
            <Td
              key={`sec-overview-${slug}-${i + 1}-value`}
              className={twMerge(
                "py-0 px-0 group-hover:bg-mineshaft-700",
                isFormExpanded && "border-t-2 border-mineshaft-500",
                (isSecretPresent && !isSecretEmpty) || isSecretImported ? "text-green-600" : "",
                isSecretPresent && isSecretEmpty && !isSecretImported ? "text-yellow" : "",
                !isSecretPresent && !isSecretEmpty && !isSecretImported ? "text-red-600" : ""
              )}
            >
              <div className="h-full w-full border-r border-mineshaft-600 py-[0.85rem] px-5">
                <div className="flex justify-center">
                  {!isSecretEmpty && (
                    <Tooltip
                      center
                      content={
                        // eslint-disable-next-line no-nested-ternary
                        isSecretPresent
                          ? "Present secret"
                          : isSecretImported
                          ? "Imported secret"
                          : "Missing secret"
                      }
                    >
                      <FontAwesomeIcon
                        // eslint-disable-next-line no-nested-ternary
                        icon={isSecretPresent ? faCheck : isSecretImported ? faFileImport : faXmark}
                      />
                    </Tooltip>
                  )}
                  {isSecretEmpty && (
                    <Tooltip content="Empty value">
                      <FontAwesomeIcon icon={faCircle} />
                    </Tooltip>
                  )}
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
                width: `calc(${expandableColWidth}px - 1rem)`
              }}
            >
              <SecretRenameRow
                secretKey={secretKey}
                environments={environments}
                secretPath={secretPath}
                getSecretByKey={getSecretByKey}
              />
              <TableContainer>
                <table className="secret-table">
                  <thead>
                    <tr className="h-10 border-b-2 border-mineshaft-600">
                      <th
                        style={{ padding: "0.5rem 1rem" }}
                        className="min-table-row min-w-[11rem]"
                      >
                        Environment
                      </th>
                      <th style={{ padding: "0.5rem 1rem" }} className="border-none">
                        Value
                      </th>
                      <div className="absolute top-0 right-0 ml-auto mt-1 mr-1 w-min">
                        <Button
                          variant="outline_bg"
                          className="p-1"
                          leftIcon={<FontAwesomeIcon icon={isSecretVisible ? faEyeSlash : faEye} />}
                          onClick={() => setIsSecretVisible.toggle()}
                        >
                          {isSecretVisible ? "Hide Values" : "Reveal Values"}
                        </Button>
                      </div>
                    </tr>
                  </thead>
                  <tbody className="border-t-2 border-mineshaft-600">
                    {environments.map(({ name, slug }) => {
                      const secret = getSecretByKey(slug, secretKey);
                      const isCreatable = !secret;

                      const isImportedSecret = isImportedSecretPresentInEnv(slug, secretKey);
                      const importedSecret = getImportedSecretByKey(slug, secretKey);

                      return (
                        <tr
                          key={`secret-expanded-${slug}-${secretKey}`}
                          className="hover:bg-mineshaft-700"
                        >
                          <td
                            className="flex h-full items-center"
                            style={{ padding: "0.25rem 1rem" }}
                          >
                            <div title={name} className="flex h-8 w-[8rem] items-center space-x-2 ">
                              <span className="truncate">{name}</span>
                              {isImportedSecret && (
                                <Tooltip
                                  content={`Imported secret from the '${importedSecret?.environmentInfo?.name}' environment`}
                                >
                                  <FontAwesomeIcon icon={faFileImport} />
                                </Tooltip>
                              )}
                            </div>
                          </td>
                          <td className="col-span-2 h-8 w-full">
                            <SecretEditRow
                              secretPath={secretPath}
                              isVisible={isSecretVisible}
                              secretName={secretKey}
                              defaultValue={
                                secret?.valueOverride ||
                                secret?.value ||
                                importedSecret?.secret?.value
                              }
                              secretId={secret?.id}
                              isOverride={Boolean(secret?.valueOverride)}
                              isImportedSecret={isImportedSecret}
                              isCreatable={isCreatable}
                              onSecretDelete={onSecretDelete}
                              onSecretCreate={onSecretCreate}
                              onSecretUpdate={onSecretUpdate}
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
