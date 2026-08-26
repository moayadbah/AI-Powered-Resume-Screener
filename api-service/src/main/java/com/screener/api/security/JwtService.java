package com.screener.api.security;

import com.screener.api.model.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    private final SecretKey key;
    private final long expiryHours;
    public JwtService(@Value("${app.jwt.secret}") String secret, @Value("${app.jwt.expiry-hours}") long expiryHours) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8)); this.expiryHours = expiryHours;
    }
    public IssuedToken issue(User user) {
        Instant now = Instant.now(); Instant expiry = now.plus(expiryHours, ChronoUnit.HOURS);
        String token = Jwts.builder().subject(user.id()).claim("email", user.email()).claim("role", user.role())
            .issuedAt(Date.from(now)).expiration(Date.from(expiry)).signWith(key, Jwts.SIG.HS256).compact();
        return new IssuedToken(token, expiry);
    }
    public CurrentUser parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        return new CurrentUser(claims.getSubject(), claims.get("email", String.class), claims.get("role", String.class));
    }
    public record IssuedToken(String value, Instant expiresAt) {}
}
