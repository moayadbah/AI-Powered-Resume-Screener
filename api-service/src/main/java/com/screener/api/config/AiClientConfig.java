package com.screener.api.config;

import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class AiClientConfig {
    @Bean public RestClient aiRestClient(@Value("${app.ai.base-url}") String baseUrl,@Value("${app.ai.service-token}") String token,
      @Value("${app.ai.connect-timeout-ms}") int connect,@Value("${app.ai.read-timeout-ms}") int read){
        var requestFactory=new SimpleClientHttpRequestFactory();requestFactory.setConnectTimeout(Duration.ofMillis(connect));requestFactory.setReadTimeout(Duration.ofMillis(read));
        return RestClient.builder().baseUrl(baseUrl).defaultHeader("X-Service-Token",token).requestFactory(requestFactory).build();
    }
}
