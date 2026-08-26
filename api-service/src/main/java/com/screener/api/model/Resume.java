package com.screener.api.model;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("resumes")
public record Resume(@Id String id, String jobId, String candidateName, String candidateEmail,
                     String originalFilename, String storagePath, String contentHash, String parsedText,
                     int pageCount, ParseStatus parseStatus, String parseError, long sizeBytes,
                     String uploadedBy, Instant uploadedAt) {
    public enum ParseStatus { PARSED, EMPTY, FAILED }
}
