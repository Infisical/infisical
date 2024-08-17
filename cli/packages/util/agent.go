package util

import (
	"fmt"
	"strconv"
	"time"
)

// ConvertPollingIntervalToTime converts a string representation of a polling interval to a time.Duration
func ConvertPollingIntervalToTime(pollingInterval string) (time.Duration, error) {
	length := len(pollingInterval)
	if length < 2 {
		return 0, fmt.Errorf("invalid format")
	}

	unit := pollingInterval[length-1:]
	numberPart := pollingInterval[:length-1]

	number, err := strconv.Atoi(numberPart)
	if err != nil {
		return 0, err
	}

	switch unit {
	case "s":
		if number < 60 {
			return 0, fmt.Errorf("polling interval must be at least 60 seconds")
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
