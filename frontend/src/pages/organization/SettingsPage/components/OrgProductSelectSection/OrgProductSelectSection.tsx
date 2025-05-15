import { createNotification } from "@app/components/notifications";
import { Switch } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";
import { useEffect, useState } from "react";

export const OrgProductSelectSection = () => {
  const [toggledProducts, setToggledProducts] = useState<{
    [key: string]: { name: string; enabled: boolean };
  }>({
    secretsProductEnabled: {
      name: "Secrets",
      enabled: true
    },
    pkiProductEnabled: {
      name: "PKI",
      enabled: true
    },
    kmsProductEnabled: {
      name: "KMS",
      enabled: true
    },
    sshProductEnabled: {
      name: "SSH",
      enabled: true
    }
  });

  const { currentOrg } = useOrganization();
  const { mutateAsync } = useUpdateOrg();

  useEffect(() => {
    for (const [key, value] of Object.entries(currentOrg)) {
      if (key in toggledProducts && typeof value === "boolean") {
        setToggledProducts((products) => ({
          ...products,
          [key]: { ...products[key], enabled: value }
        }));
      }
    }
  }, [currentOrg]);

  const onProductToggle = async (value: boolean, key: string) => {
    setToggledProducts((products) => ({
      ...products,
      [key]: { ...products[key], enabled: value }
    }));

    console.log(key, value);

    // Update backend
    await mutateAsync({
      orgId: currentOrg.id,
      [key]: value
    });

    createNotification({
      text: `Successfully ${value ? "enabled" : "disabled"} ${toggledProducts[key].name}`,
      type: "success"
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <h2 className="text-xl font-semibold text-mineshaft-100">Organization Products</h2>
      <p className="mb-4 text-gray-400">
        Select which products are available for your organization.
      </p>

      <div className="flex flex-col gap-2">
        {Object.entries(toggledProducts).map(([key, product]) => (
          <Switch
            key={key}
            id={`enable-${key}`}
            onCheckedChange={(value) => onProductToggle(value, key)}
            isChecked={product.enabled}
          >
            <p className="mr-4 w-12">{product.name}</p>
          </Switch>
        ))}
      </div>
    </div>
  );
};
