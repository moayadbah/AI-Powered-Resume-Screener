package com.screener.api.config;
import com.screener.api.service.AiClient;
import org.slf4j.Logger;import org.slf4j.LoggerFactory;import org.springframework.boot.ApplicationArguments;import org.springframework.boot.ApplicationRunner;import org.springframework.stereotype.Component;
@Component public class AiStartupReporter implements ApplicationRunner {private static final Logger log=LoggerFactory.getLogger(AiStartupReporter.class);private final AiClient ai;public AiStartupReporter(AiClient ai){this.ai=ai;}public void run(ApplicationArguments args){var info=ai.modelInfo();if(info!=null)log.info("ai-service model: {} weights: {}",info.modelVersion(),info.weights());}}
