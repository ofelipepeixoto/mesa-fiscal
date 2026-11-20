# syntax=docker/dockerfile:1
FROM maven:3.10.0-eclipse-temurin-25@sha256:37ecd7dbbe926e9b69586747a25164c0f3b764455072322d25cc7724ee9e1b64 AS build
ENV JAVA_TOOL_OPTIONS="-XX:-UseBASE64Intrinsics -Dspring.autoconfigure.exclude=org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.otlp.OtlpTracingAutoConfiguration"
WORKDIR /src
COPY --from=upstream . .
# O CI do Simples gera o catálogo a partir das migrações do Regime Regular.
COPY --from=catalog /flyway ./flyway
# Uma única versão do catálogo atende ao build, à suíte upstream e ao uso local.
ENV APPLICATION_DB_DOWNLOAD_URL=""
COPY deploy/spring-parent.sh /tmp/spring-parent.sh
RUN sh /tmp/spring-parent.sh \
    && mvn --version \
    && mkdir -p calculadora/db \
    && mvn -B -ntp flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
    && test -s calculadora/db/calculadora-pro.db \
    && mvn -B -ntp -Dtest=SimplesNacionalControllerTest,ValidacaoNomenclaturaSimplesTest package \
    && jar tf target/api-simples-nacional.jar | grep -Fx 'BOOT-INF/lib/spring-boot-4.1.3.jar'

FROM eclipse-temurin:25-jre@sha256:945247f9d092703e0c6be92243ef3c51640229e23ab34d353c8dcdc73e6cd4e6
ENV JAVA_TOOL_OPTIONS="-XX:-UseBASE64Intrinsics -Dspring.autoconfigure.exclude=org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.otlp.OtlpTracingAutoConfiguration"
RUN java -version
WORKDIR /app
COPY --from=build /src/target/api-simples-nacional.jar ./app.jar
COPY --from=build /src/calculadora/db/calculadora-pro.db ./calculadora/db/calculadora-pro.db
COPY --from=upstream /LICENSE ./LICENSE-simples
COPY --from=catalog /LICENSE ./LICENSE-catalogo
ENV SPRING_PROFILES_ACTIVE=offline
USER 10001:10001
EXPOSE 8082
ENTRYPOINT ["java","-jar","app.jar"]
