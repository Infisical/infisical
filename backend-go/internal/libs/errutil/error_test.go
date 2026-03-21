package errutil_test

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"testing"

	goa "goa.design/goa/v3/pkg"

	"github.com/infisical/api/internal/libs/errutil"
)

func TestConstructors(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		err        *errutil.Error
		wantName   string
		wantStatus int
		wantMsg    string
	}{
		{"BadRequest", errutil.BadRequest("bad %s", "input"), "BadRequest", 400, "bad input"},
		{"Unauthorized", errutil.Unauthorized("no auth"), "UnauthorizedError", 401, "no auth"},
		{"Forbidden", errutil.Forbidden("denied"), "ForbiddenError", 403, "denied"},
		{"NotFound", errutil.NotFound("missing %s", "item"), "NotFound", 404, "missing item"},
		{"RateLimit", errutil.RateLimit("slow down"), "RateLimitExceeded", 429, "slow down"},
		{"InternalServer", errutil.InternalServer("broken"), "InternalServerError", 500, "broken"},
		{"DatabaseErr", errutil.DatabaseErr("query failed"), "DatabaseError", 500, "query failed"},
		{"GatewayTimeout", errutil.GatewayTimeout("timed out"), "GatewayTimeoutError", 504, "timed out"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if tt.err.Name != tt.wantName {
				t.Errorf("Name = %q, want %q", tt.err.Name, tt.wantName)
			}
			if tt.err.Status != tt.wantStatus {
				t.Errorf("Status = %d, want %d", tt.err.Status, tt.wantStatus)
			}
			if tt.err.Message != tt.wantMsg {
				t.Errorf("Message = %q, want %q", tt.err.Message, tt.wantMsg)
			}
		})
	}
}

func TestErrorString(t *testing.T) {
	t.Parallel()

	t.Run("without cause", func(t *testing.T) {
		t.Parallel()

		err := errutil.NotFound("not here")
		if err.Error() != "not here" {
			t.Errorf("Error() = %q, want %q", err.Error(), "not here")
		}
	})

	t.Run("with cause", func(t *testing.T) {
		t.Parallel()

		cause := fmt.Errorf("pg error")
		err := errutil.DatabaseErr("query failed").WithErr(cause)
		want := "query failed: pg error"
		if err.Error() != want {
			t.Errorf("Error() = %q, want %q", err.Error(), want)
		}
	})
}

func TestUnwrap(t *testing.T) {
	t.Parallel()

	cause := fmt.Errorf("root cause")
	err := errutil.InternalServer("wrapped").WithErr(cause)

	if !errors.Is(err, cause) {
		t.Error("errors.Is should find the wrapped cause")
	}
}

func TestErrorsAs(t *testing.T) {
	t.Parallel()

	t.Run("direct", func(t *testing.T) {
		t.Parallel()

		err := errutil.NotFound("missing")

		var target *errutil.Error
		if !errors.As(err, &target) {
			t.Fatal("errors.As should match *errutil.Error")
		}
		if target.Name != "NotFound" {
			t.Errorf("Name = %q, want %q", target.Name, "NotFound")
		}
	})

	t.Run("through fmt.Errorf wrap", func(t *testing.T) {
		t.Parallel()

		inner := errutil.BadRequest("bad input")
		wrapped := fmt.Errorf("service layer: %w", inner)

		var target *errutil.Error
		if !errors.As(wrapped, &target) {
			t.Fatal("errors.As should find *errutil.Error through fmt.Errorf wrapping")
		}
		if target.Status != 400 {
			t.Errorf("Status = %d, want 400", target.Status)
		}
	})

	t.Run("outermost wins over inner", func(t *testing.T) {
		t.Parallel()

		inner := errutil.DatabaseErr("constraint violation")
		outer := errutil.BadRequest("slug already exists").WithErr(inner)

		var target *errutil.Error
		if !errors.As(outer, &target) {
			t.Fatal("errors.As should match")
		}
		// errors.As finds the outermost *errutil.Error first
		if target.Status != 400 {
			t.Errorf("Status = %d, want 400 (outermost)", target.Status)
		}
	})
}

func TestWithDetails(t *testing.T) {
	t.Parallel()

	details := map[string]string{"field": "name"}
	err := errutil.BadRequest("invalid").WithDetails(details)

	if err.Details == nil {
		t.Fatal("Details should not be nil")
	}

	m, ok := err.Details.(map[string]string)
	if !ok {
		t.Fatal("Details should be map[string]string")
	}
	if m["field"] != "name" {
		t.Errorf("Details[field] = %q, want %q", m["field"], "name")
	}
}

func TestFormatter(t *testing.T) {
	t.Parallel()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	formatter := errutil.NewFormatter(logger)
	ctx := context.Background()

	t.Run("4xx errutil.Error sends message to client", func(t *testing.T) {
		t.Parallel()

		resp := formatter(ctx, errutil.NotFound("project %s not found", "abc"))

		body, ok := resp.(*errutil.ErrorBody)
		if !ok {
			t.Fatal("expected *errutil.ErrorBody")
		}
		if body.Code != http.StatusNotFound {
			t.Errorf("Code = %d, want %d", body.Code, http.StatusNotFound)
		}
		if body.Message != "project abc not found" {
			t.Errorf("Message = %q, want %q", body.Message, "project abc not found")
		}
		if body.Err != "NotFound" {
			t.Errorf("Err = %q, want %q", body.Err, "NotFound")
		}
		if body.StatusCode() != http.StatusNotFound {
			t.Errorf("StatusCode() = %d, want %d", body.StatusCode(), http.StatusNotFound)
		}
	})

	t.Run("4xx errutil.Error includes details", func(t *testing.T) {
		t.Parallel()

		details := map[string]string{"slug": "taken"}
		resp := formatter(ctx, errutil.BadRequest("slug exists").WithDetails(details))

		body, ok := resp.(*errutil.ErrorBody)
		if !ok {
			t.Fatal("expected *errutil.ErrorBody")
		}
		if body.Details == nil {
			t.Fatal("Details should not be nil for 4xx")
		}
	})

	t.Run("5xx errutil.Error masks message", func(t *testing.T) {
		t.Parallel()

		resp := formatter(ctx, errutil.DatabaseErr("pg: unique constraint on users_email_key"))

		body, ok := resp.(*errutil.ErrorBody)
		if !ok {
			t.Fatal("expected *errutil.ErrorBody")
		}
		if body.Code != http.StatusInternalServerError {
			t.Errorf("Code = %d, want %d", body.Code, http.StatusInternalServerError)
		}
		if body.Message != "Something went wrong" {
			t.Errorf("Message = %q, want %q", body.Message, "Something went wrong")
		}
		if body.Err != "DatabaseError" {
			t.Errorf("Err = %q, want %q", body.Err, "DatabaseError")
		}
	})

	t.Run("goa.ServiceError maps to status", func(t *testing.T) {
		t.Parallel()

		goaErr := goa.MissingFieldError("name", "payload")
		resp := formatter(ctx, goaErr)

		body, ok := resp.(*errutil.ErrorBody)
		if !ok {
			t.Fatal("expected *errutil.ErrorBody")
		}
		if body.Code != http.StatusBadRequest {
			t.Errorf("Code = %d, want %d", body.Code, http.StatusBadRequest)
		}
	})

	t.Run("unknown error returns safe 500", func(t *testing.T) {
		t.Parallel()

		resp := formatter(ctx, fmt.Errorf("something unexpected"))

		body, ok := resp.(*errutil.ErrorBody)
		if !ok {
			t.Fatal("expected *errutil.ErrorBody")
		}
		if body.Code != http.StatusInternalServerError {
			t.Errorf("Code = %d, want %d", body.Code, http.StatusInternalServerError)
		}
		if body.Message != "Something went wrong" {
			t.Errorf("Message = %q, want %q", body.Message, "Something went wrong")
		}
		if body.Err != "InternalServerError" {
			t.Errorf("Err = %q, want %q", body.Err, "InternalServerError")
		}
	})

	t.Run("wrapped errutil.Error is found through fmt.Errorf", func(t *testing.T) {
		t.Parallel()

		inner := errutil.Forbidden("no access")
		wrapped := fmt.Errorf("permission check: %w", inner)
		resp := formatter(ctx, wrapped)

		body, ok := resp.(*errutil.ErrorBody)
		if !ok {
			t.Fatal("expected *errutil.ErrorBody")
		}
		if body.Code != http.StatusForbidden {
			t.Errorf("Code = %d, want %d", body.Code, http.StatusForbidden)
		}
		if body.Message != "no access" {
			t.Errorf("Message = %q, want %q", body.Message, "no access")
		}
	})
}
