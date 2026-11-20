#!/bin/sh
set -eu
# Aplica o patch da distribuição à dependência Spring Boot dos dois motores RTC.
# Uma revisão upstream com outro parent precisa de nova verificação antes do build.
parent=$(sed -n '/<parent>/,/<\/parent>/p' pom.xml)
if ! printf '%s\n' "$parent" | grep -Fq '<artifactId>spring-boot-starter-parent</artifactId>'; then
  echo 'O parent não corresponde ao projeto Spring Boot esperado.' >&2
  exit 1
fi
if ! printf '%s\n' "$parent" | grep -Fq '<version>4.1.2</version>'; then
  echo 'A revisão fiscal está usando outro parent. Revise e retire ou atualize este patch.' >&2
  exit 1
fi
sed -i '/<parent>/,/<\/parent>/s|<version>4\.1\.2</version>|<version>4.1.3</version>|' pom.xml
sed -n '/<parent>/,/<\/parent>/p' pom.xml | grep -F '<version>4.1.3</version>'
