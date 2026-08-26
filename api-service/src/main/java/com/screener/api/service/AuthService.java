package com.screener.api.service;

import com.screener.api.dto.AuthDtos.*;
import com.screener.api.exception.ApiException;
import com.screener.api.exception.ErrorCode;
import com.screener.api.model.User;
import com.screener.api.repository.UserRepository;
import com.screener.api.security.JwtService;
import java.time.Instant;
import java.util.Locale;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {
    private static final String DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    private final UserRepository users; private final PasswordEncoder encoder; private final JwtService jwt;
    public AuthService(UserRepository users, PasswordEncoder encoder, JwtService jwt) { this.users=users; this.encoder=encoder; this.jwt=jwt; }
    public AuthResponse register(RegisterRequest request) {
        String email = normalize(request.email());
        if (users.findByEmail(email).isPresent()) throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED);
        try {
            User user = users.save(new User(null, email, encoder.encode(request.password()), request.fullName().trim(), "RECRUITER", Instant.now()));
            return auth(user);
        } catch (DuplicateKeyException ex) { throw new ApiException(ErrorCode.EMAIL_ALREADY_REGISTERED); }
    }
    public AuthResponse login(LoginRequest request) {
        String email=normalize(request.email()); User user=users.findByEmail(email).orElse(null);
        String hash=user == null ? DUMMY_HASH : user.passwordHash(); boolean valid=encoder.matches(request.password(), hash);
        if (user == null || !valid) throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        return auth(user);
    }
    public UserResponse me(String id) { return users.findById(id).map(AuthService::map).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED)); }
    private AuthResponse auth(User user) { var issued=jwt.issue(user); return new AuthResponse(issued.value(), issued.expiresAt(), map(user)); }
    private static UserResponse map(User u) { return new UserResponse(u.id(),u.email(),u.fullName(),u.role(),u.createdAt()); }
    private static String normalize(String email) { return email.trim().toLowerCase(Locale.ROOT); }
}
