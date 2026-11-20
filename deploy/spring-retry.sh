#!/bin/sh
set -eu
# POM original do Regime Regular f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4.
# Uma mudança oficial exige rever este patch antes de atualizar a distribuição.
printf '%s  pom.xml\n' 'd1a379668c4ebba07b5ff4ab7004f7ef15adf9f719f4c4adfc9a6d596a0b8ddd' | sha256sum -c -
# Correção da CVE-2026-41710 indicada em https://spring.io/security/cve-2026-41710/.
sed -i '/<groupId>org.springframework.retry<\/groupId>/,/<\/dependency>/s|<version>2\.0\.12</version>|<version>2.0.13</version>|' pom.xml
sed -n '/<groupId>org.springframework.retry<\/groupId>/,/<\/dependency>/p' pom.xml | grep -F '<version>2.0.13</version>'
