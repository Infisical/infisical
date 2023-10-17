import { faCircle } from "@fortawesome/free-regular-svg-icons";
import {
  faAngleDown,
  faCheck,
  faEye,
  faEyeSlash,
  faKey,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, TableContainer, Td, Tooltip, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { DecryptedSecret } from "@app/hooks/api/secrets/types";

import { SecretEditRow } from "./SecretEditRow";

type Props = {
  secretKey: string;
  secretPath: string;
  environments: { name: string; slug: string }[];
  expandableColWidth: number;
  getSecretByKey: (slug: string, key: string) => DecryptedSecret | undefined;
  onSecretCreate: (env: string, key: string, value: string) => Promise<void>;
  onSecretUpdate: (env: string, key: string, value: string, secretId?: string) => Promise<void>;
  onSecretDelete: (env: string, key: string, secretId?: string) => Promise<void>;
};

export const SecretOverviewTableRow = ({
  secretKey,
  environments = [],
  secretPath,
  getSecretByKey,
  onSecretUpdate,
  onSecretCreate,
  onSecretDelete,
  expandableColWidth
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
                <FontAwesomeIcon icon={isFormExpanded ? faAngleDown : faKey} />
              </div>
              <div title={secretKey}>{secretKey}</div>
            </div>
          </div>
        </Td>
        {environments.map(({ slug }, i) => {
          const secret = getSecretByKey(slug, secretKey);
          const isSecretPresent = Boolean(secret);
          const isSecretEmpty = secret?.value === "";
          return (
            <Td
              key={`sec-overview-${slug}-${i + 1}-value`}
              className={twMerge(
                "py-0 px-0 group-hover:bg-mineshaft-700",
                isFormExpanded && "border-t-2 border-mineshaft-500",
                isSecretPresent && !isSecretEmpty ? "text-green-600" : "",
                isSecretPresent && isSecretEmpty ? "text-yellow" : "",
                !isSecretPresent && !isSecretEmpty ? "text-red-600" : ""
              )}
            >
              <div className="h-full w-full border-r border-mineshaft-600 py-[0.85rem] px-5">
                <div className="flex justify-center">
                  {!isSecretEmpty && (
                    <Tooltip content={isSecretPresent ? "Present secret" : "Missing secret"}>
                      <FontAwesomeIcon icon={isSecretPresent ? faCheck : faXmark} />
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

                      return (
                        <tr
                          key={`secret-expanded-${slug}-${secretKey}`}
                          className="hover:bg-mineshaft-700"
                        >
                          <td className="flex" style={{ padding: "0.25rem 1rem" }}>
                            <div className="flex h-8 items-center">{name}</div>
                          </td>
                          <td className="col-span-2 h-8 w-full">
                            <SecretEditRow
                              secretPath={secretPath}
                              isVisible={isSecretVisible}
                              secretName={secretKey}
                              defaultValue={secret?.value}
                              secretId={secret?._id}
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
