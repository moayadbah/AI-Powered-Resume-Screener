package com.screener.api.dto;

import com.screener.api.model.Resume;
import java.time.Instant;
import java.util.List;

public final class ResumeDtos {
    private ResumeDtos() {}
    public record UploadedResume(String id, String candidateName, String originalFilename,
                                 Resume.ParseStatus parseStatus, int pageCount, long sizeBytes, Instant uploadedAt) {}
    public record RejectedFile(String filename, String reason) {}
    public record UploadResponse(List<UploadedResume> uploaded, List<RejectedFile> rejected) {}
}
