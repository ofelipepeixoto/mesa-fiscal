#!/usr/bin/env bash
set -euo pipefail

mode=${1:-gerar}
[[ "$#" -le 1 && "$mode" =~ ^(gerar|--check)$ ]] || { echo 'Use compilar-danfse.sh [--check].' >&2; exit 1; }

# O download acontece apenas na preparação. O XML do usuário nunca entra neste script.
root=$(cd "$(dirname "$0")/.." && pwd)
commit=$(node "$root/scripts/upstreams.mjs" pin danfse)
go_version=$(node "$root/scripts/verificar-distribuicao-danfse.mjs" go-version)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
[[ "$(GOTOOLCHAIN=local go env GOVERSION)" = "go$go_version" ]] || { echo "Use Go $go_version para recompilar esta revisão." >&2; exit 1; }
git -C "$work" init -q source
git -C "$work/source" fetch -q --depth 1 https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse.git "$commit"
git -C "$work/source" checkout --quiet --detach FETCH_HEAD
test "$(git -C "$work/source" rev-parse HEAD)" = "$commit"
cd "$work/source"
sha256sum -c "$root/deploy/danfse-go/upstream.sha256"
git apply --check "$root/deploy/danfse-go/nt009-issqn.patch"
git apply "$root/deploy/danfse-go/nt009-issqn.patch"
cp "$root/deploy/danfse-go/go.mod" "$root/deploy/danfse-go/go.sum" ./
mkdir -p "$work/engine"
export GOOS=js GOARCH=wasm CGO_ENABLED=0 GOTOOLCHAIN=local
go mod download
go mod verify
go build -mod=readonly -trimpath -buildvcs=false -ldflags="-s -w" -o "$work/danfse.wasm" ./cmd/danfse-wasm
gzip -n -9 -c "$work/danfse.wasm" > "$work/engine/danfse.wasm.gz"
go mod verify
goroot=$(go env GOROOT)
cp "$goroot/lib/wasm/wasm_exec.js" "$work/engine/"
cp "$goroot/LICENSE" "$work/engine/LICENSE-Go.txt"
cp LICENSE "$work/engine/LICENSE-DANFSe.txt"
go list -mod=readonly -deps -f '{{with .Module}}{{if not .Main}}{{.Path}}|{{.Dir}}{{end}}{{end}}' ./cmd/danfse-wasm | sort -u > "$work/modules"
while IFS='|' read -r module module_dir; do
  [[ -z "$module_dir" ]] && continue
  printf '\n============ %s ============\n' "$module"
  find "$module_dir" -maxdepth 2 -type f \( -iname 'license*' -o -iname 'notice*' -o -iname 'copying*' \) -print0 | sort -z | xargs -0 -r cat
done < "$work/modules" > "$work/engine/THIRD-PARTY.txt"
{
  go version
  go list -deps -mod=readonly -f '{{with .Module}}{{.Path}} {{.Version}}{{end}}' ./cmd/danfse-wasm | sort -u
  printf 'Fonte: https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse/commit/%s\n' "$commit"
  printf 'Overlay Mesa Fiscal NT 009 (SHA-256): %s\n' "$(sha256sum "$root/deploy/danfse-go/nt009-issqn.patch" | cut -d' ' -f1)"
  (cd "$work" && sha256sum danfse.wasm)
} > "$work/engine/BUILD.txt"
(cd "$work/engine" && sha256sum BUILD.txt LICENSE-*.txt THIRD-PARTY.txt danfse.wasm.gz wasm_exec.js > SHA256SUMS && sha256sum -c SHA256SUMS)
node "$root/scripts/verificar-distribuicao-danfse.mjs" gerar "$work/engine" "$work/danfse-integrity.mjs"
node "$root/scripts/testar-motor-wasm.mjs" "$work/engine" "$work/exemplo-danfse.pdf"
if [[ "$mode" = --check ]]; then
  node "$root/scripts/verificar-distribuicao-danfse.mjs" comparar "$work/engine" "$work/danfse-integrity.mjs"
  echo 'Distribuição recompilada idêntica aos arquivos propostos.'
  exit 0
fi
mkdir -p "$root/public/engine"
cp -R "$work/engine/." "$root/public/engine/"
cp "$work/exemplo-danfse.pdf" "$root/public/exemplo-danfse.pdf"
cp "$work/danfse-integrity.mjs" "$root/public/danfse-integrity.mjs"
node "$root/scripts/verificar-distribuicao-danfse.mjs"
echo "Motor da Receita e PDF fictício prontos."
