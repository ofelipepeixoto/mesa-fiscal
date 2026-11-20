#!/usr/bin/env bash
set -euo pipefail

# Resolver versões exige os imports da Receita, ausentes na pasta de overlay.
root=$(cd "$(dirname "$0")/.." && pwd)
commit=$(node "$root/scripts/upstreams.mjs" pin danfse)
go_version=$(node "$root/scripts/verificar-distribuicao-danfse.mjs" go-version)
[[ "$(GOTOOLCHAIN=local go env GOVERSION)" = "go$go_version" ]] || { echo "Use Go $go_version para revisar os módulos." >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git init -q "$work/source"
git -C "$work/source" fetch -q --depth 1 https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse.git "$commit"
git -C "$work/source" checkout -q --detach FETCH_HEAD
test "$(git -C "$work/source" rev-parse HEAD)" = "$commit"
cd "$work/source"
sha256sum -c "$root/deploy/danfse-go/upstream.sha256"
cp "$root/deploy/danfse-go/go.mod" "$root/deploy/danfse-go/go.sum" ./
export GOTOOLCHAIN=local CGO_ENABLED=0
go get -u=patch ./...
go mod tidy
go mod verify
go build -mod=readonly -trimpath -buildvcs=false -o "$work/danfse" ./cmd/danfse
GOOS=js GOARCH=wasm go build -mod=readonly -trimpath -buildvcs=false -o "$work/danfse.wasm" ./cmd/danfse-wasm
cp go.mod go.sum "$root/deploy/danfse-go/"
echo 'Módulos resolvidos e compilados com o código-fonte oficial. Recompile a distribuição antes de abrir o PR.'
