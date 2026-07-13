# gipc-core — multi-stage, static, distroless-nonroot. Built by .github/workflows/core.yml on amd64.
# CI build context is services/core (self-contained module; stdlib-only, so no go.sum).
FROM golang:1.22 AS build
WORKDIR /src
COPY . .
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build \
      -ldflags="-s -w -X github.com/gabrielipcarvalho/gipc/services/core/internal/server.Version=${VERSION}" \
      -o /core ./cmd/core

FROM gcr.io/distroless/static:nonroot
COPY --from=build /core /core
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/core"]
