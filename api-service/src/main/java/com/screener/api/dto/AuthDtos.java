package com.screener.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class AuthDtos {
    private AuthDtos() {}
    public record RegisterRequest(@NotBlank @Email @Size(max=254) String email,
                                  @NotBlank @Size(min=8,max=128) String password,
                                  @NotBlank @Size(min=2,max=100) String fullName) {}
    public record LoginRequest(@NotBlank @Email @Size(max=254) String email,
                               @NotBlank @Size(min=8,max=128) String password) {}
    public record UserResponse(String id, String email, String fullName, String role, Instant createdAt) {}
    public record AuthResponse(String token, Instant expiresAt, UserResponse user) {}
}
