import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import {
  FilterableSelect,
  FormControl,
  Input,
  Select,
  SelectItem,
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useAzureConnectionListServices } from "@app/hooks/api/appConnections/azure";
import { TAzureClient } from "@app/hooks/api/appConnections/azure/types";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

const KEY_ALGORITHMS = [
  { value: "RSA_2048", label: "RSA 2048" },
  { value: "RSA_4096", label: "RSA 4096" },
  { value: "ECDSA_P256", label: "ECDSA P-256" },
  { value: "ECDSA_P384", label: "ECDSA P-384" }
];

export const AzureCertificateRotationParametersFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AzureCertificate;
    }
  >();

  const connectionId = watch("connection.id");

  const { data: clients, isPending: isClientsPending } = useAzureConnectionListServices(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  return (
    <div className="max-h-[calc(100vh-30rem)] space-y-4 overflow-y-auto">
      <Controller
        name="parameters.objectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Application"
            helperText={
              <Tooltip
                className="max-w-md"
                content={
                  <>
                    Ensure that your connection has the{" "}
                    <span className="font-semibold">
                      Application.ReadWrite.All, Directory.ReadWrite.All,
                      Application.ReadWrite.OwnedBy, user_impersonation and User.Read
                    </span>{" "}
                    permissions and the application exists in Azure.
                  </>
                }
              >
                <div>
                  <span>Don&#39;t see the application you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="bottom"
              isLoading={isClientsPending && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={clients?.find((client) => client.id === value) ?? null}
              onChange={(option) => {
                onChange((option as SingleValue<TAzureClient>)?.id ?? null);
                setValue("parameters.appName", (option as SingleValue<TAzureClient>)?.name ?? "");
              }}
              options={clients}
              placeholder="Select an application..."
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
            />
          </FormControl>
        )}
      />

      {/* Optional Private Key */}
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            label="Private Key (PEM Format)"
            icon={<FontAwesomeIcon icon={faInfoCircle} size="sm" />}
            tooltipText={
              <>
                <p>
                  Optional existing private key in PEM format. If provided, only the certificate
                  will be generated using this key.
                </p>
                <p className="pt-2">
                  If not provided, a new private key will be generated automatically.
                </p>
              </>
            }
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <TextArea
              value={value || ""}
              onChange={(e) => {
                if (e.target.value.trim() === "") {
                  setValue("parameters.privateKey", undefined);
                } else {
                  onChange(e.target.value);
                }
              }}
              placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
              rows={4}
            />
          </FormControl>
        )}
        control={control}
        name="parameters.privateKey"
      />

      {/* Optional Distinguished Name */}
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            label="Distinguished Name (DN)"
            icon={<FontAwesomeIcon icon={faInfoCircle} size="sm" />}
            tooltipText={
              <>
                <p>
                  Certificate&apos;s Distinguished Name in standard format (e.g.,
                  CN=example.com,O=Organization,C=US).
                </p>
                <p className="pt-2">
                  If not provided, will default to CN with the application name or a generated name.
                </p>
              </>
            }
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input
              value={value || ""}
              onChange={onChange}
              placeholder="CN=example.com,O=My Organization,C=US"
            />
          </FormControl>
        )}
        control={control}
        name="parameters.distinguishedName"
      />

      {/* Optional Key Algorithm */}
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            label="Key Algorithm"
            icon={<FontAwesomeIcon icon={faInfoCircle} size="sm" />}
            tooltipText={
              <>
                <p>
                  Cryptographic algorithm for key generation. RSA is widely supported, while ECDSA
                  provides better performance and smaller key sizes.
                </p>
                <p className="pt-2">Default: RSA 2048</p>
              </>
            }
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Select value={value || "RSA_2048"} onValueChange={onChange} className="w-full">
              {KEY_ALGORITHMS.map((algorithm) => (
                <SelectItem key={algorithm.value} value={algorithm.value}>
                  {algorithm.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
        control={control}
        name="parameters.keyAlgorithm"
      />
    </div>
  );
};
