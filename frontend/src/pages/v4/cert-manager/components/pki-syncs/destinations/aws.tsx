import { useEffect, useRef } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { StatusText, SmallText } from "@infisical/cipher/ui/text";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import type { TAwsListener } from "@app/hooks/api/pkiSyncs/types";

import { useV4Adapter } from "../../../../data/adapters";
import { PkiSyncConnectionField } from "../connection-field";
import { errorOf } from "../fields";
import { fetchErrorOf, ListField } from "./list-field";

const REGION_OPTIONS = AWS_REGIONS.map(({ name, slug }) => ({ value: slug, label: name }));

type TAwsRegionForm = TPkiSyncForm & {
  destination: PkiSync.AwsCertificateManager | PkiSync.AwsSecretsManager;
};

function RegionSelect({ help, disabled }: { help: string; disabled?: boolean }) {
  const { control } = useFormContext<TAwsRegionForm>();
  return (
    <Controller
      control={control}
      name="destinationConfig.region"
      render={({ field, fieldState: { error } }) => (
        <Field label="AWS region" help={help} error={errorOf(error)}>
          <Select
            aria-label="AWS region"
            value={field.value ?? ""}
            onValueChange={field.onChange}
            options={REGION_OPTIONS}
            placeholder="Select an AWS region"
            disabled={disabled}
            invalid={Boolean(error)}
          />
        </Field>
      )}
    />
  );
}

export function AwsRegionFields({ help }: { help: string }) {
  const { setValue } = useFormContext<TAwsRegionForm>();
  return (
    <Stack gap={16}>
      <PkiSyncConnectionField onChange={() => setValue("destinationConfig.region", "")} />
      <RegionSelect help={help} />
    </Stack>
  );
}

type TElbForm = TPkiSyncForm & { destination: PkiSync.AwsElasticLoadBalancer };

const toListener = (listener: TAwsListener) => ({
  listenerArn: listener.listenerArn,
  port: listener.port,
  protocol: listener.protocol
});

export function AwsElasticLoadBalancerFields() {
  const { control, setValue } = useFormContext<TElbForm>();
  const adapter = useV4Adapter("pkiSyncs");

  const connectionId = useWatch({ control, name: "connection.id" });
  const region = useWatch({ control, name: "destinationConfig.region" });
  const loadBalancerArn = useWatch({ control, name: "destinationConfig.loadBalancerArn" });

  const isInitialMount = useRef(true);
  const previousRegion = useRef(region);
  const previousLoadBalancerArn = useRef(loadBalancerArn);

  const { fields, replace } = useFieldArray({ control, name: "destinationConfig.listeners" });

  const loadBalancersEnabled = Boolean(connectionId && region);
  const loadBalancers = adapter.useAwsLoadBalancers(
    { connectionId, region },
    { enabled: loadBalancersEnabled }
  );

  const listenersEnabled = Boolean(connectionId && region && loadBalancerArn);
  const listeners = adapter.useAwsListeners(
    { connectionId, region, loadBalancerArn },
    { enabled: listenersEnabled }
  );
  const listenerList = listeners.data;

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousRegion.current = region;
      previousLoadBalancerArn.current = loadBalancerArn;
      return;
    }

    if (region && previousRegion.current && region !== previousRegion.current) {
      setValue("destinationConfig.loadBalancerArn", "");
      replace([]);
    }
    previousRegion.current = region;
  }, [region, loadBalancerArn, setValue, replace]);

  useEffect(() => {
    if (!loadBalancerArn || !listenerList || listenerList.length === 0) return;

    if (previousLoadBalancerArn.current && loadBalancerArn !== previousLoadBalancerArn.current) {
      replace(listenerList.map(toListener));
      previousLoadBalancerArn.current = loadBalancerArn;
      return;
    }

    previousLoadBalancerArn.current = loadBalancerArn;

    const hasValidListeners =
      fields.length > 0 &&
      fields.some((selected) =>
        listenerList.some((listener) => listener.listenerArn === selected.listenerArn)
      );
    if (!hasValidListeners) replace(listenerList.map(toListener));
  }, [listenerList, loadBalancerArn, fields, replace]);

  const selectedArns = new Set(fields.map((listener) => listener.listenerArn));

  const toggleListener = (listener: TAwsListener, checked: boolean) =>
    replace(
      checked
        ? [...fields, toListener(listener)]
        : fields.filter((selected) => selected.listenerArn !== listener.listenerArn)
    );

  const renderListeners = () => {
    if (listeners.isPending && listenersEnabled)
      return (
        <StatusText loading size="sm">
          Loading listeners...
        </StatusText>
      );
    if (!listenerList?.length)
      return <SmallText muted>No HTTPS/TLS listeners found for this load balancer.</SmallText>;
    return (
      <Stack gap={12}>
        {listenerList.map((listener) => (
          <Checkbox
            key={listener.listenerArn}
            label={`Port ${listener.port} (${listener.protocol})`}
            description={listener.sslPolicy ? `SSL policy: ${listener.sslPolicy}` : undefined}
            checked={selectedArns.has(listener.listenerArn)}
            onCheckedChange={(checked) => toggleListener(listener, checked === true)}
          />
        ))}
      </Stack>
    );
  };

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.region", "");
          setValue("destinationConfig.loadBalancerArn", "");
          replace([]);
        }}
      />
      <Controller
        control={control}
        name="destinationConfig.region"
        render={({ field, fieldState: { error } }) => (
          <Field
            label="AWS region"
            help="The AWS region where your Elastic Load Balancers are located."
            error={errorOf(error)}
          >
            <Select
              aria-label="AWS region"
              value={field.value ?? ""}
              onValueChange={field.onChange}
              options={REGION_OPTIONS}
              placeholder="Select an AWS region"
              disabled={!connectionId}
              invalid={Boolean(error)}
            />
          </Field>
        )}
      />
      <ListField
        name="destinationConfig.loadBalancerArn"
        label="Load balancer"
        help="The Application or Network Load Balancer to deploy certificates to."
        options={(loadBalancers.data ?? []).map((loadBalancer) => ({
          value: loadBalancer.loadBalancerArn,
          label: loadBalancer.loadBalancerName
        }))}
        loading={loadBalancers.isPending && loadBalancersEnabled}
        fetchError={fetchErrorOf(
          loadBalancers,
          loadBalancersEnabled,
          "Failed to list load balancers."
        )}
        disabled={!connectionId || !region}
        placeholder="Select a load balancer"
        emptyText="No load balancers found in this region."
        onSelect={() => replace([])}
      />
      {loadBalancerArn && (
        <Controller
          control={control}
          name="destinationConfig.listeners"
          render={({ fieldState: { error } }) => (
            <Field
              group
              label="HTTPS/TLS listeners"
              help="The listeners that receive the certificate. You can set a default certificate from the certificates table after creating the sync."
              error={errorOf(error)}
            >
              {renderListeners()}
            </Field>
          )}
        />
      )}
    </Stack>
  );
}
