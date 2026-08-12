# api-service

Auth, upload, PDF parsing, and orchestration. Java 21 · Spring Boot 3.3 ·
spring-data-mongodb · PDFBox 3.

The only service the browser talks to, and the only writer to MongoDB.

**Spec: [../docs/05-API-SERVICE.md](../docs/05-API-SERVICE.md).** Endpoint
shapes: [../docs/03-API-CONTRACT.md](../docs/03-API-CONTRACT.md). Documents and
indexes: [../docs/02-DATA-MODEL.md](../docs/02-DATA-MODEL.md).

## Run

```bash
brew install --cask temurin@21     # not installed by default

docker compose --profile dev up -d mongodb ai-service

export MONGODB_URI='mongodb://screener:<pw>@localhost:27017/screener?authSource=admin'
export JWT_SECRET="$(openssl rand -base64 48)"
export SERVICE_TOKEN=dev-token
export AI_SERVICE_BASE_URL=http://localhost:8000
export UPLOAD_DIR=./uploads
./mvnw spring-boot:run
```

```bash
./mvnw -B verify        # needs a running Docker daemon for Testcontainers
```

Not implemented yet — see [task list B1–B13](../docs/tasks/INTERN-B-MARWAN.md).
