package com.screener.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public final class JobDtos {
    private JobDtos() {}
    public record CreateJobRequest(@NotBlank @Size(min=3,max=120) String title,
                                   @NotBlank @Size(min=50,max=20000) String description,
                                   @Size(max=50) List<@NotBlank @Size(max=60) String> requiredSkills,
                                   @Size(max=120) String location) {}
    public record JobResponse(String id, String title, String description, List<String> requiredSkills,
                              String location, Instant createdAt, Instant updatedAt, long resumeCount,
                              long screenedCount, long unreadableCount, Instant lastScreenedAt) {}
    public record JobSummary(String id, String title, String location, List<String> requiredSkills,
                             Instant createdAt, long resumeCount, long screenedCount) {}
    public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {}
}
