FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
USER node
ENV CONTAINER=1
EXPOSE 4173
CMD ["node","server/start.mjs"]
