package api

import (
	"fmt"

	"github.com/go-resty/resty/v2"
	"github.com/infisical/go-sdk/packages/util"
)

type GenericRequestError struct {
	err       error
	operation string
}

func (e *GenericRequestError) Error() string {
	return fmt.Sprintf("%s: Unable to complete api request [err=%v]", e.operation, e.err)
}

func NewGenericRequestError(operation string, err error) *GenericRequestError {
	return &GenericRequestError{err: err, operation: operation}
}

// APIError represents an error response from the API
type APIError struct {
	AdditionalContext string `json:"additionalContext,omitempty"`
	Operation         string `json:"operation"`
	Method            string `json:"method"`
	URL               string `json:"url"`
	StatusCode        int    `json:"statusCode"`
	ErrorMessage      string `json:"message,omitempty"`
	ReqId             string `json:"reqId,omitempty"`
}

func (e *APIError) Error() string {
	msg := fmt.Sprintf(
		"%s Unsuccessful response [%v %v] [status-code=%v] [request-id=%v]",
		e.Operation,
		e.Method,
		e.URL,
		e.StatusCode,
		e.ReqId,
	)

	if e.ErrorMessage != "" {
		msg = fmt.Sprintf("%s [message=\"%s\"]", msg, e.ErrorMessage)
	}

	if e.AdditionalContext != "" {
		msg = fmt.Sprintf("%s [additional-context=\"%s\"]", msg, e.AdditionalContext)
	}

	return msg
}

func NewAPIErrorWithResponse(operation string, res *resty.Response, additionalContext *string) error {
	errorMessage := util.TryParseErrorBody(res)
	reqId := util.TryExtractReqId(res)

	if res == nil {
		return NewGenericRequestError(operation, fmt.Errorf("response is nil"))
	}

	apiError := &APIError{
		Operation:  operation,
		Method:     res.Request.Method,
		URL:        res.Request.URL,
		StatusCode: res.StatusCode(),
		ReqId:      reqId,
	}

	if additionalContext != nil && *additionalContext != "" {
		apiError.AdditionalContext = *additionalContext
	}

	if errorMessage != "" {
		apiError.ErrorMessage = errorMessage
	}

	return apiError
}
