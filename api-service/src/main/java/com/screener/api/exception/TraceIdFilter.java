package com.screener.api.exception;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.HexFormat;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class TraceIdFilter extends OncePerRequestFilter {
    private static final SecureRandom RANDOM = new SecureRandom();
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String id = newTraceId();
        MDC.put("traceId", id);
        response.setHeader("X-Trace-Id", id);
        try { chain.doFilter(request, response); } finally { MDC.remove("traceId"); }
    }
    public static String currentTraceId() { String id = MDC.get("traceId"); return id == null ? newTraceId() : id; }
    private static String newTraceId() { byte[] bytes = new byte[8]; RANDOM.nextBytes(bytes); return HexFormat.of().formatHex(bytes); }
}
