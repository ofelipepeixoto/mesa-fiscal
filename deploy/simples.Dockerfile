# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY --from=upstream . .
# O CI do Simples gera o catálogo a partir das migrações do Regime Regular.
COPY --from=catalog /flyway ./flyway
# Um teste de NFS-e do código-fonte espera o comportamento anterior à migração V0059.
# Execute-o na base correspondente. A imagem final sempre usa TODAS as migrações.
ENV APPLICATION_DB_DOWNLOAD_URL=""
RUN mkdir -p calculadora/db \
    && mvn -B -ntp flyway:migrate -Dflyway.target=58 -Dflyway.configFiles=./flyway/flyway-pro.conf \
    && test -s calculadora/db/calculadora-pro.db \
    && mvn -B -ntp -Dtest=SimplesNacionalControllerTest test \
    && grep -q 'tests="24"' target/surefire-reports/TEST-*.SimplesNacionalControllerTest.xml
RUN mvn -B -ntp flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
    && mvn -B -ntp '-Dtest=SimplesNacionalControllerTest,!SimplesNacionalControllerTest#naoImplementadoTambemEmNfse' package \
    && grep -q 'tests="23"' target/surefire-reports/TEST-*.SimplesNacionalControllerTest.xml

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/api-simples-nacional.jar ./app.jar
COPY --from=build /src/calculadora/db/calculadora-pro.db ./calculadora/db/calculadora-pro.db
COPY --from=upstream /LICENSE ./LICENSE-simples
COPY --from=catalog /LICENSE ./LICENSE-catalogo
ENV SPRING_PROFILES_ACTIVE=offline
USER 10001:10001
EXPOSE 8082
ENTRYPOINT ["java","-jar","app.jar"]
