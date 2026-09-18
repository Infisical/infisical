PROTOC ?= protoc
PROTOC_GEN_GO ?= protoc-gen-go
PROTOC_GEN_GO_GRPC ?= protoc-gen-go-grpc

PROTO_DIR := proto
GEN_DIR := gen/proto
PROTO_FILES := $(wildcard $(PROTO_DIR)/*.proto)

.PHONY: gen-proto

gen-proto:
	@test -n "$(PROTO_FILES)" || (echo "No protobuf files found in $(PROTO_DIR)" >&2; exit 1)
	@command -v $(PROTOC) >/dev/null 2>&1 || (echo "$(PROTOC) is required to generate protobuf files" >&2; exit 1)
	@command -v $(PROTOC_GEN_GO) >/dev/null 2>&1 || (echo "$(PROTOC_GEN_GO) is required; install it with: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest" >&2; exit 1)
	@command -v $(PROTOC_GEN_GO_GRPC) >/dev/null 2>&1 || (echo "$(PROTOC_GEN_GO_GRPC) is required; install it with: go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest" >&2; exit 1)
	@mkdir -p $(GEN_DIR)
	$(PROTOC) -I $(PROTO_DIR) \
		--go_out=$(GEN_DIR) --go_opt=paths=source_relative \
		--go-grpc_out=$(GEN_DIR) --go-grpc_opt=paths=source_relative \
		$(PROTO_FILES)
