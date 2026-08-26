package com.screener.api.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.screener.api.exception.ErrorCode;
import com.screener.api.exception.ErrorResponse;
import com.screener.api.exception.TraceIdFilter;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(10); }
    @Bean SecurityFilterChain security(HttpSecurity http, JwtAuthFilter filter, ObjectMapper mapper) throws Exception {
        http.csrf(c -> c.disable()).cors(Customizer.withDefaults()).sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a.requestMatchers("/api/auth/register", "/api/auth/login", "/actuator/health").permitAll().anyRequest().authenticated())
            .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class)
            .exceptionHandling(e -> e.authenticationEntryPoint((req,res,ex) -> write(mapper,res,ErrorCode.UNAUTHORIZED))
                .accessDeniedHandler((req,res,ex) -> write(mapper,res,ErrorCode.FORBIDDEN)));
        return http.build();
    }
    private static void write(ObjectMapper mapper, jakarta.servlet.http.HttpServletResponse res, ErrorCode code) throws java.io.IOException {
        res.setStatus(code.status().value()); res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        mapper.writeValue(res.getOutputStream(), ErrorResponse.of(code, code.defaultMessage(), TraceIdFilter.currentTraceId(), null));
    }
    @Bean CorsConfigurationSource cors(@Value("${app.cors.allowed-origins}") String origins) {
        CorsConfiguration c = new CorsConfiguration(); c.setAllowedOrigins(List.of(origins.split(",")));
        c.setAllowedMethods(List.of("GET","POST","OPTIONS")); c.setAllowedHeaders(List.of("Authorization","Content-Type")); c.setAllowCredentials(false);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**", c); return source;
    }
}
