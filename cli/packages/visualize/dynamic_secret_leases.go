package visualize

import infisicalModels "github.com/infisical/go-sdk/packages/models"

func PrintAllDyamicSecretLeaseCredentials(leaseCredentials map[string]any) {
	rows := [][]string{}
	for key, value := range leaseCredentials {
		if cred, ok := value.(string); ok {
			rows = append(rows, []string{key, cred})
		}
	}

	headers := []string{"Key", "Value"}

	GenericTable(headers, rows)
}

func PrintAllDynamicRootCredentials(dynamicRootCredentials []infisicalModels.DynamicSecret) {
	rows := [][]string{}
	for _, el := range dynamicRootCredentials {
		rows = append(rows, []string{el.Name, el.Type, el.DefaultTTL, el.MaxTTL})
	}

	headers := []string{"Name", "Provider", "Default TTL", "Max TTL"}

	GenericTable(headers, rows)
}

func PrintAllDynamicSecretLeases(dynamicSecretLeases []infisicalModels.DynamicSecretLease) {
	rows := [][]string{}
	const timeformat = "02-Jan-2006 03:04:05 PM"
	for _, el := range dynamicSecretLeases {
		rows = append(rows, []string{el.Id, el.ExpireAt.Local().Format(timeformat), el.CreatedAt.Local().Format(timeformat)})
	}

	headers := []string{"ID", "Expire At", "Created At"}

	GenericTable(headers, rows)
}
