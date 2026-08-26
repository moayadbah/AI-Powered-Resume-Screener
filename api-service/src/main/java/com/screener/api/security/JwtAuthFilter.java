package com.screener.api.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.screener.api.exception.ErrorCode;
import com.screener.api.exception.ErrorResponse;
import com.screener.api.exception.TraceIdFilter;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    private final JwtService jwtService; private final ObjectMapper mapper;
    public JwtAuthFilter(JwtService jwtService, ObjectMapper mapper) { this.jwtService = jwtService; this.mapper = mapper; }
    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String header = req.getHeader("Authorization");
        if (header == null) { chain.doFilter(req, res); return; }
        if (!header.startsWith("Bearer ") || header.length() == 7) { unauthorized(res); return; }
        try {
            CurrentUser user = jwtService.parse(header.substring(7));
            var auth = new UsernamePasswordAuthenticationToken(user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.role())));
            SecurityContextHolder.getContext().setAuthentication(auth);
            chain.doFilter(req, res);
        } catch (JwtException | IllegalArgumentException ex) { SecurityContextHolder.clearContext(); unauthorized(res); }
    }
    private void unauthorized(HttpServletResponse res) throws IOException {
        res.setStatus(401); res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(res.getOutputStream(), ErrorResponse.of(ErrorCode.UNAUTHORIZED, ErrorCode.UNAUTHORIZED.defaultMessage(), TraceIdFilter.currentTraceId(), null));
    }
}
