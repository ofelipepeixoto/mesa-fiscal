# syntax=docker/dockerfile:1
# "upstream" is the named build context fixed to the Receita Federal commit in compose.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY --from=upstream / ./
RUN mkdir -p calculadora/db \
    && sh mvnw -B -ntp flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
    && sh mvnw -B -ntp -DskipTests package \
    && test -s calculadora/db/calculadora-pro.db \
    && test -s target/api-regime-geral.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/calculadora/db/calculadora-pro.db ./calculadora/db/calculadora-pro.db
COPY --from=build /src/target/api-regime-geral.jar ./api.jar
COPY --from=build /src/LICENSE ./LICENSE.upstream
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java","-Dspring.profiles.active=offline","-jar","/app/api.jar"]
