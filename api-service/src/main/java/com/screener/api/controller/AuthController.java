package com.screener.api.controller;

import com.screener.api.dto.AuthDtos.*;
import com.screener.api.security.CurrentUser;
import com.screener.api.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/auth")
public class AuthController {
    private final AuthService service; public AuthController(AuthService service){this.service=service;}
    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED) public AuthResponse register(@Valid @RequestBody RegisterRequest r){return service.register(r);}
    @PostMapping("/login") public AuthResponse login(@Valid @RequestBody LoginRequest r){return service.login(r);}
    @GetMapping("/me") public UserResponse me(@AuthenticationPrincipal CurrentUser user){return service.me(user.id());}
}
