# syntax=docker/dockerfile:1
# "upstream" is the named build context fixed to the Receita Federal commit in compose.
FROM maven:3.10.0-eclipse-temurin-25@sha256:37ecd7dbbe926e9b69586747a25164c0f3b764455072322d25cc7724ee9e1b64 AS build
ENV JAVA_TOOL_OPTIONS="-XX:-UseBASE64Intrinsics -Dspring.autoconfigure.exclude=org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.otlp.OtlpTracingAutoConfiguration"
WORKDIR /src
COPY --from=upstream / ./
COPY deploy/spring-parent.sh /tmp/spring-parent.sh
COPY deploy/spring-retry.sh /tmp/spring-retry.sh
RUN sh /tmp/spring-retry.sh \
    && sh /tmp/spring-parent.sh \
    && mvn --version \
    && mkdir -p calculadora/db \
    && mvn -B -ntp flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf \
    && mvn -B -ntp -Dtest=Teste_CasosFixosArredondamento package \
    && test -s calculadora/db/calculadora-pro.db \
    && test -s target/api-regime-geral.jar \
    && jar tf target/api-regime-geral.jar > /tmp/jar-entries.txt \
    && grep -Fx 'BOOT-INF/lib/spring-boot-4.1.3.jar' /tmp/jar-entries.txt \
    && grep -Fx 'BOOT-INF/lib/spring-retry-2.0.13.jar' /tmp/jar-entries.txt \
    && ! grep -Fx 'BOOT-INF/lib/spring-retry-2.0.12.jar' /tmp/jar-entries.txt

FROM eclipse-temurin:25-jre@sha256:945247f9d092703e0c6be92243ef3c51640229e23ab34d353c8dcdc73e6cd4e6
ENV JAVA_TOOL_OPTIONS="-XX:-UseBASE64Intrinsics -Dspring.autoconfigure.exclude=org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.otlp.OtlpTracingAutoConfiguration"
RUN java -version
WORKDIR /app
COPY --from=build /src/calculadora/db/calculadora-pro.db ./calculadora/db/calculadora-pro.db
COPY --from=build /src/target/api-regime-geral.jar ./api.jar
COPY --from=build /src/LICENSE ./LICENSE.upstream
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java","-Dspring.profiles.active=offline","-jar","/app/api.jar"]
