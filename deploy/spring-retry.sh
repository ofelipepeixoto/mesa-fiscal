#!/bin/sh
set -eu
# POM original do Regime Regular 0d4b073da96db8d015e50736d1552bbc7623224e.
# Uma mudança oficial exige rever este patch antes de atualizar a distribuição.
printf '%s  pom.xml\n' '71fddc25a26b43d2e999f26dbb30aba723d78a4240549dc92e3f9c2e5c1d08c5' | sha256sum -c -
# Correção da CVE-2026-41710 indicada em https://spring.io/security/cve-2026-41710/.
sed -i '/<groupId>org.springframework.retry<\/groupId>/,/<\/dependency>/s|<version>2\.0\.12</version>|<version>2.0.13</version>|' pom.xml
sed -n '/<groupId>org.springframework.retry<\/groupId>/,/<\/dependency>/p' pom.xml | grep -F '<version>2.0.13</version>'
