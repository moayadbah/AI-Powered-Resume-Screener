package com.screener.api.config;

import jakarta.annotation.PostConstruct;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class StartupValidator {
    private static final String PLACEHOLDER = "replace-me-with-a-real-32-char-minimum-secret";
    private final String jwtSecret, serviceToken; private final Path uploadDir;
    public StartupValidator(@Value("${app.jwt.secret}") String jwtSecret, @Value("${app.ai.service-token}") String serviceToken,
                            @Value("${app.upload.dir}") String uploadDir) { this.jwtSecret=jwtSecret; this.serviceToken=serviceToken; this.uploadDir=Path.of(uploadDir); }
    @PostConstruct void validate() throws Exception {
        if (jwtSecret == null || jwtSecret.length() < 32 || PLACEHOLDER.equals(jwtSecret)) throw new IllegalStateException("JWT_SECRET must be a non-placeholder value of at least 32 characters");
        if (serviceToken == null || serviceToken.isBlank() || serviceToken.startsWith("replace-me")) throw new IllegalStateException("SERVICE_TOKEN must be set");
        Files.createDirectories(uploadDir);
        if (!Files.isWritable(uploadDir)) throw new IllegalStateException("UPLOAD_DIR is not writable");
    }
}
