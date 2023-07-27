import { faCheck, faEye, faEyeSlash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, TableContainer, Td, Tr } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { DecryptedSecret } from "@app/hooks/api/secrets/types";

import { SecretEditRow } from "./SecretEditRow";

type Props = {
  secretKey: string;
  environments: { name: string; slug: string }[];
  expandableColWidth: number;
  getSecretByKey: (slug: string, key: string) => DecryptedSecret | undefined;
  onSecretCreate: (env: string, key: string, value: string) => Promise<void>;
  onSecretUpdate: (env: string, key: string, value: string) => Promise<void>;
  onSecretDelete: (env: string, key: string) => Promise<void>;
};

export const SecretOverviewTableRow = ({
  secretKey,
  environments = [],
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
        <Td className="sticky left-0 z-10 border-x border-mineshaft-700 bg-mineshaft-800 bg-clip-padding py-3 group-hover:bg-mineshaft-600">
          {secretKey}
        </Td>
        {environments.map(({ slug }, i) => {
          const secret = getSecretByKey(slug, secretKey);
          const isSecretPresent = Boolean(secret);
          return (
            <Td
              key={`sec-overview-${slug}-${i + 1}-value`}
              className={twMerge(
                "border-x border-mineshaft-700 py-3",
                isSecretPresent ? "text-green-600" : "text-red-800"
              )}
            >
              <div className="flex justify-center">
                <FontAwesomeIcon icon={isSecretPresent ? faCheck : faXmark} />
              </div>
            </Td>
          );
        })}
      </Tr>
      {isFormExpanded && (
        <Tr>
          <Td colSpan={totalCols}>
            <div
              className="rounded-md bg-bunker-700 p-4 pb-6"
              style={{
                width: `calc(${expandableColWidth}px - 2rem)`,
                position: "sticky",
                left: "1.25rem",
                right: "1.25rem"
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="text-lg font-medium">Secrets</div>
                <div>
                  <Button
                    variant="outline_bg"
                    className="p-1"
                    leftIcon={<FontAwesomeIcon icon={isSecretVisible ? faEyeSlash : faEye} />}
                    onClick={() => setIsSecretVisible.toggle()}
                  >
                    {isSecretVisible ? "Hide" : "Reveal"}
                  </Button>
                </div>
              </div>
              <TableContainer>
                <table className="secret-table">
                  <thead>
                    <tr>
                      <th
                        style={{ padding: "0.5rem 1rem" }}
                        className="min-table-row min-w-[11rem]"
                      >
                        Environment
                      </th>
                      <th style={{ padding: "0.5rem 1rem" }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {environments.map(({ name, slug }) => {
                      const secret = getSecretByKey(slug, secretKey);
                      const isCreatable = !secret;

                      return (
                        <tr
                          key={`secret-expanded-${slug}-${secretKey}`}
                          className="hover:bg-mineshaft-700"
                        >
                          <td className="flex" style={{ padding: "0.25rem 1rem" }}>
                            <div className="flex h-10 items-center">{name}</div>
                          </td>
                          <td
                            className="h-10 border-l border-mineshaft-600"
                            style={{ padding: "0.5rem 1rem" }}
                          >
                            <SecretEditRow
                              isVisible={isSecretVisible}
                              secretName={secretKey}
                              defaultValue={secret?.value}
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
