package com.screener.api.model;

import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("screenings")
public record Screening(@Id String id, String jobId, String resumeId, String candidateName, int score,
                        double semanticScore, double skillScore, List<String> matchedSkills,
                        List<String> missingSkills, String summary, List<String> strengths,
                        List<String> concerns, boolean summaryDegraded, String modelVersion,
                        String promptVersion, Weights weights, Instant scoredAt) {
    public record Weights(double semantic, double skill) {}
}
