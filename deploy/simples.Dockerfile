# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY --from=upstream . .
# O CI do Simples gera o catálogo a partir das migrações do Regime Regular.
COPY --from=catalog /flyway ./flyway
RUN mkdir -p calculadora/db \
    && mvn -B -ntp flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
    && test -s calculadora/db/calculadora-pro.db \
    && mvn -B -ntp -Dtest=SimplesNacionalControllerTest package

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
