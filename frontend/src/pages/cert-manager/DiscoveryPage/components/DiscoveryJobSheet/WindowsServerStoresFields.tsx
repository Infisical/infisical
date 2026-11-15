import { Controller, useFormContext } from "react-hook-form";

import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle,
  Label,
  Toggle
} from "@app/components/v3";
import {
  WindowsCertificateStore,
  WindowsCertificateStoreLabels
} from "@app/hooks/api/pkiDiscovery/types";

import { CA_CERTIFICATE_STORES, TWindowsServerDiscoveryJobForm } from "./discovery-job-form-schema";

const STORE_DESCRIPTIONS: Record<WindowsCertificateStore, string> = {
  [WindowsCertificateStore.Personal]:
    "Server certificates for IIS, Remote Desktop, SQL Server and most other applications.",
  [WindowsCertificateStore.WebHosting]: "Certificates added for IIS sites.",
  [WindowsCertificateStore.RemoteDesktop]: "The certificate Remote Desktop uses on this server.",
  [WindowsCertificateStore.IntermediateCertificationAuthorities]: "Intermediate CA certificates.",
  [WindowsCertificateStore.TrustedRootCertificationAuthorities]:
    "Root CAs this server trusts, including the public ones built into Windows."
};

const SERVER_STORES = [
  WindowsCertificateStore.Personal,
  WindowsCertificateStore.WebHosting,
  WindowsCertificateStore.RemoteDesktop
];

type StoreOptionsProps = {
  stores: WindowsCertificateStore[];
  value: WindowsCertificateStore[];
  onChange: (stores: WindowsCertificateStore[]) => void;
  isDisabled?: boolean;
};

const StoreOptions = ({ stores, value, onChange, isDisabled }: StoreOptionsProps) => (
  <FieldGroup data-slot="checkbox-group">
    {stores.map((store) => {
      const id = `certificate-store-${store.replace(" ", "-")}`;
      return (
        <Field key={store} orientation="horizontal" data-disabled={isDisabled}>
          <Checkbox
            id={id}
            variant="project"
            isDisabled={isDisabled}
            isChecked={value.includes(store)}
            onCheckedChange={(checked) =>
              onChange(
                Object.values(WindowsCertificateStore).filter((s) =>
                  s === store ? checked === true : value.includes(s)
                )
              )
            }
          />
          <FieldContent>
            <FieldTitle>
              <Label htmlFor={id} className={isDisabled ? "cursor-not-allowed" : "cursor-pointer"}>
                {WindowsCertificateStoreLabels[store]}
              </Label>
            </FieldTitle>
            <FieldDescription>{STORE_DESCRIPTIONS[store]}</FieldDescription>
          </FieldContent>
        </Field>
      );
    })}
  </FieldGroup>
);

export const WindowsServerStoresFields = () => {
  const { control, trigger, watch } = useFormContext<TWindowsServerDiscoveryJobForm>();
  const includeCa = watch("importStandaloneCaCertificates");

  return (
    <Controller
      control={control}
      name="certificateStores"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <div className="mb-4 flex flex-col gap-8">
          <FieldSet>
            <FieldLegend variant="label">Server Certificate Stores</FieldLegend>
            <StoreOptions stores={SERVER_STORES} value={value} onChange={onChange} />
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">CA Certificate Stores</FieldLegend>
            <Controller
              control={control}
              name="importStandaloneCaCertificates"
              render={({ field: { onChange: setIncludeCa } }) => (
                <Field orientation="horizontal" className="mb-2">
                  <FieldContent>
                    <FieldTitle>
                      <Label htmlFor="import-standalone-ca" className="cursor-pointer">
                        Include CA Certificates
                      </Label>
                    </FieldTitle>
                    <FieldDescription>
                      Import the CA certificates in the selected stores. A leaf certificate always
                      comes in with its chain.
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    id="import-standalone-ca"
                    variant="project"
                    checked={includeCa}
                    onCheckedChange={(checked) => {
                      setIncludeCa(checked);
                      if (!checked) {
                        onChange(value.filter((store) => !CA_CERTIFICATE_STORES.includes(store)));
                        trigger("certificateStores");
                      }
                    }}
                  />
                </Field>
              )}
            />
            <StoreOptions
              stores={CA_CERTIFICATE_STORES}
              value={value}
              onChange={onChange}
              isDisabled={!includeCa}
            />
          </FieldSet>
          <FieldError errors={[error]} />
        </div>
      )}
    />
  );
};
