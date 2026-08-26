package com.screener.api.model;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("users")
public record User(@Id String id, String email, String passwordHash, String fullName, String role, Instant createdAt) {}
