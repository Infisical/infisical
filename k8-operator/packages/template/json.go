package template

import (
	"encoding/json"
	"fmt"
)

func fromJSON(in []byte) any {
	var out any
	err := json.Unmarshal(in, &out)
	if err != nil {
		panic(fmt.Sprintf(errUnmarshalJSON, err))
	}
	return out
}

func toJSON(in any) string {
	output, err := json.Marshal(in)
	if err != nil {
		panic(fmt.Sprintf(errMarshalJSON, err))
	}
	return string(output)
}

func jsonStringToJSON(in string) any {
	var out any
	err := json.Unmarshal([]byte(in), &out)
	if err != nil {
		panic(fmt.Sprintf(errUnmarshalJSON, err))
	}
	return out
}
