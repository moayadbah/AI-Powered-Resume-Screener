package com.screener.api.model;

import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("jobs")
public record Job(@Id String id, String title, String description, List<String> requiredSkills, String location,
                  String createdBy, Instant createdAt, Instant updatedAt) {}
