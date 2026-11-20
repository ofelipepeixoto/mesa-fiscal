FROM golang:1.27.4-bookworm@sha256:4fa7c968ba93f1635670522dbb01a2c78150443e1385746924566079f36570ea AS build
WORKDIR /src
COPY --from=upstream / ./
COPY deploy/danfse-go/ /overlay/
RUN sha256sum -c /overlay/upstream.sha256 && cp /overlay/go.mod /overlay/go.sum ./ && go mod download && go mod verify
RUN CGO_ENABLED=0 GOTOOLCHAIN=local go build -mod=readonly -trimpath -buildvcs=false -ldflags="-s -w" -o /out/danfse ./cmd/danfse

FROM scratch
COPY --from=build /out/danfse /danfse
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /usr/share/zoneinfo /usr/share/zoneinfo
ENV TZ=America/Sao_Paulo OTEL_SDK_DISABLED=true LOG_LEVEL=error
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/danfse"]
