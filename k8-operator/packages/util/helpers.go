package util

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

func ConvertIntervalToDuration(resyncInterval string) (time.Duration, error) {
	length := len(resyncInterval)
	if length < 2 {
		return 0, fmt.Errorf("invalid format")
	}

	unit := resyncInterval[length-1:]
	numberPart := resyncInterval[:length-1]

	number, err := strconv.Atoi(numberPart)
	if err != nil {
		return 0, err
	}

	switch unit {
	case "s":
		if number < 5 {
			return 0, fmt.Errorf("resync interval must be at least 5 seconds")
		}
		return time.Duration(number) * time.Second, nil
	case "m":
		return time.Duration(number) * time.Minute, nil
	case "h":
		return time.Duration(number) * time.Hour, nil
	case "d":
		return time.Duration(number) * 24 * time.Hour, nil
	case "w":
		return time.Duration(number) * 7 * 24 * time.Hour, nil
	default:
		return 0, fmt.Errorf("invalid time unit")
	}
}

func ConvertIntervalToTime(resyncInterval string) (time.Time, error) {
	duration, err := ConvertIntervalToDuration(resyncInterval)
	if err != nil {
		return time.Time{}, err
	}

	// Add duration to current time
	return time.Now().Add(duration), nil
}

func AppendAPIEndpoint(address string) string {
	if strings.HasSuffix(address, "/api") {
		return address
	}
	if address[len(address)-1] == '/' {
		return address + "api"
	}
	return address + "/api"
}
