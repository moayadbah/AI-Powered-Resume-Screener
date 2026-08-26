package com.screener.api.dto;

import com.screener.api.model.Resume;
import com.screener.api.model.Screening;
import java.time.Instant;
import java.util.List;

public final class CandidateDtos {
    private CandidateDtos() {}
    public record ScreeningSummary(int score, double semanticScore, double skillScore, List<String> matchedSkills,
                                   List<String> missingSkills, boolean summaryDegraded, Instant scoredAt) {}
    public record ScreeningDetail(int score, double semanticScore, double skillScore, List<String> matchedSkills,
                                  List<String> missingSkills, boolean summaryDegraded, Instant scoredAt,
                                  String summary, List<String> strengths, List<String> concerns,
                                  String modelVersion, String promptVersion, Screening.Weights weights) {}
    public record Candidate(String resumeId, String candidateName, String candidateEmail, String originalFilename,
                            Resume.ParseStatus parseStatus, Instant uploadedAt, ScreeningSummary screening) {}
    public record CandidateDetail(String resumeId, String jobId, String jobTitle, String candidateName,
                                  String candidateEmail, String originalFilename, Resume.ParseStatus parseStatus,
                                  int pageCount, Instant uploadedAt, ScreeningDetail screening) {}
}
