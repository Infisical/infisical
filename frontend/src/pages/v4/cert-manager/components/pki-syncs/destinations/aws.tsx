import { useEffect, useRef } from "react";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { StatusText, SmallText } from "@infisical/cipher/ui/text";

import type { TAwsListener } from "@app/hooks/api/pkiSyncs/types";

import { RegionCombobox } from "../../../../components/region-combobox";
import { useV4Adapter } from "../../../../data/adapters";
import { PkiSyncConnectionField } from "../connection-field";
import { useDraftField, useDraftValue, usePkiSyncDraft } from "../fields";
import { fetchErrorOf, ListField } from "./list-field";

function RegionSelect({ help, disabled }: { help: string; disabled?: boolean }) {
  const field = useDraftField<string | undefined>("destinationConfig.region");
  return (
    <Field label="AWS region" help={help} error={field.error}>
      <RegionCombobox
        label="AWS region"
        value={field.value ?? ""}
        onValueChange={field.onChange}
        placeholder="Select an AWS region"
        disabled={disabled}
        invalid={Boolean(field.error)}
      />
    </Field>
  );
}

export function AwsRegionFields({ help }: { help: string }) {
  const { setValue } = usePkiSyncDraft();
  return (
    <Stack gap={16}>
      <PkiSyncConnectionField onChange={() => setValue("destinationConfig.region", "")} />
      <RegionSelect help={help} />
    </Stack>
  );
}

const toListener = (listener: TAwsListener) => ({
  listenerArn: listener.listenerArn,
  port: listener.port,
  protocol: listener.protocol
});

export function AwsElasticLoadBalancerFields() {
  const { setValue } = usePkiSyncDraft();
  const adapter = useV4Adapter("pkiSyncs");

  const connectionId = useDraftValue<string>("connection.id");
  const region = useDraftValue<string>("destinationConfig.region");
  const loadBalancerArn = useDraftValue<string>("destinationConfig.loadBalancerArn");
  const listenersField = useDraftField<TAwsListener[] | undefined>("destinationConfig.listeners");
  const fields = listenersField.value ?? [];

  const isInitialMount = useRef(true);
  const previousRegion = useRef(region);
  const previousLoadBalancerArn = useRef(loadBalancerArn);

  const replace = (next: ReturnType<typeof toListener>[]) =>
    setValue("destinationConfig.listeners", next);

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
      setValue("destinationConfig.listeners", []);
    }
    previousRegion.current = region;
  }, [region, loadBalancerArn, setValue]);

  useEffect(() => {
    if (!loadBalancerArn || !listenerList || listenerList.length === 0) return;

    if (previousLoadBalancerArn.current && loadBalancerArn !== previousLoadBalancerArn.current) {
      setValue("destinationConfig.listeners", listenerList.map(toListener));
      previousLoadBalancerArn.current = loadBalancerArn;
      return;
    }

    previousLoadBalancerArn.current = loadBalancerArn;

    const selected = listenersField.value ?? [];
    const hasValidListeners = selected.some((entry) =>
      listenerList.some((listener) => listener.listenerArn === entry.listenerArn)
    );
    if (!hasValidListeners) setValue("destinationConfig.listeners", listenerList.map(toListener));
  }, [listenerList, loadBalancerArn, listenersField.value, setValue]);

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
      <RegionSelect
        help="The AWS region where your Elastic Load Balancers are located."
        disabled={!connectionId}
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
        <Field
          group
          label="HTTPS/TLS listeners"
          help="The listeners that receive the certificate. You can set a default certificate from the certificates table after creating the sync."
          error={listenersField.error}
        >
          {renderListeners()}
        </Field>
      )}
    </Stack>
  );
}
