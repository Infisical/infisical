import { useEffect, useState } from "react";

import { Switch } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

export const OrgProductSelectSection = () => {
  const [toggledProducts, setToggledProducts] = useState<{
    [key: string]: { name: string; enabled: boolean };
  }>({
    secretsProductEnabled: {
      name: "Secret Management",
      enabled: true
    },
    pkiProductEnabled: {
      name: "Certificate Manager",
      enabled: true
    },
    kmsProductEnabled: {
      name: "KMS",
      enabled: true
    },
    sshProductEnabled: {
      name: "SSH",
      enabled: true
    },
    scannerProductEnabled: {
      name: "Scanner",
      enabled: true
    },
    shareSecretsProductEnabled: {
      name: "Share Secrets",
      enabled: true
    }
  });

  const [isLoading, setIsLoading] = useState(false);

  const { currentOrg } = useOrganization();
  const { mutateAsync } = useUpdateOrg();

  useEffect(() => {
    Object.entries(currentOrg).forEach(([key, value]) => {
      if (key in toggledProducts && typeof value === "boolean") {
        setToggledProducts((products) => ({
          ...products,
          [key]: { ...products[key], enabled: value }
        }));
      }
    });
  }, [currentOrg?.id]);

  const onProductToggle = async (value: boolean, key: string) => {
    setIsLoading(true);

    setToggledProducts((products) => ({
      ...products,
      [key]: { ...products[key], enabled: value }
    }));

    await mutateAsync({
      orgId: currentOrg.id,
      [key]: value
    });

    setIsLoading(false);
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-6 py-5">
      <h2 className="text-xl font-medium text-mineshaft-100">Enabled Products</h2>
      <p className="mb-4 text-gray-400">
        Select which products are available for your organization.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {Object.entries(toggledProducts).map(([key, product]) => (
          <Switch
            key={key}
            id={`enable-${key}`}
            isDisabled={isLoading}
            onCheckedChange={(value) => onProductToggle(value, key)}
            isChecked={product.enabled}
            className="ml-0"
            containerClassName="flex-row-reverse gap-3 w-fit"
          >
            {product.name}
          </Switch>
        ))}
      </div>
    </div>
  );
};
