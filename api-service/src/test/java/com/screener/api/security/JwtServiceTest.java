package com.screener.api.security;

import static org.assertj.core.api.Assertions.*;
import com.screener.api.model.User;
import io.jsonwebtoken.ExpiredJwtException;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class JwtServiceTest {
 private static final String SECRET="a-secure-test-secret-that-is-at-least-32-characters";
 @Test void issuesHs256TokenWithRequiredClaims(){var service=new JwtService(SECRET,24);var token=service.issue(new User("665f1a2b3c4d5e6f70819200","user@example.com","hidden","User","RECRUITER",Instant.now()));var current=service.parse(token.value());assertThat(current.id()).isEqualTo("665f1a2b3c4d5e6f70819200");assertThat(current.email()).isEqualTo("user@example.com");assertThat(current.role()).isEqualTo("RECRUITER");}
 @Test void rejectsExpiredToken(){var service=new JwtService(SECRET,-1);var token=service.issue(new User("665f1a2b3c4d5e6f70819200","u@e.com","hidden","User","RECRUITER",Instant.now()));assertThatThrownBy(()->service.parse(token.value())).isInstanceOf(ExpiredJwtException.class);}
 @Test void rejectsMalformedToken(){var service=new JwtService(SECRET,24);assertThatThrownBy(()->service.parse("not-a-jwt")).isInstanceOf(RuntimeException.class);}
}
