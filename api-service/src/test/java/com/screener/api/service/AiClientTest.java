package com.screener.api.service;

import static com.github.tomakehurst.wiremock.client.WireMock.*;import static org.assertj.core.api.Assertions.*;
import com.github.tomakehurst.wiremock.WireMockServer;import com.screener.api.config.AiClientConfig;import com.screener.api.dto.AiDtos.*;import com.screener.api.exception.AiServiceException;import java.util.List;import org.junit.jupiter.api.AfterEach;import org.junit.jupiter.api.BeforeEach;import org.junit.jupiter.api.Test;
class AiClientTest {
 private WireMockServer server;private AiClient client;private final ScoreRequest request=new ScoreRequest("A sufficiently long backend engineering job description for the scoring contract.",List.of("java"),List.of(new ResumeInput("r1","Java backend engineer")));
 @BeforeEach void start(){server=new WireMockServer(0);server.start();client=new AiClient(new AiClientConfig().aiRestClient(server.baseUrl(),"token",200,200));}
 @AfterEach void stop(){server.stop();}
 @Test void scoreSuccess(){server.stubFor(post("/score").willReturn(okJson(success())));assertThat(client.score(request).results()).singleElement().extracting(ScoreResult::score).isEqualTo(82);server.verify(postRequestedFor(urlEqualTo("/score")).withHeader("X-Service-Token",equalTo("token")));}
 @Test void retriesOneFiveHundredThenSucceeds(){server.stubFor(post("/score").inScenario("retry").whenScenarioStateIs("Started").willReturn(serverError()).willSetStateTo("ok"));server.stubFor(post("/score").inScenario("retry").whenScenarioStateIs("ok").willReturn(okJson(success())));assertThat(client.score(request)).isNotNull();server.verify(2,postRequestedFor(urlEqualTo("/score")));}
 @Test void secondFiveHundredBecomesUnavailable(){server.stubFor(post("/score").willReturn(serverError()));assertThatThrownBy(()->client.score(request)).isInstanceOf(AiServiceException.class);server.verify(2,postRequestedFor(urlEqualTo("/score")));}
 @Test void fourHundredIsNotRetried(){server.stubFor(post("/score").willReturn(badRequest()));assertThatThrownBy(()->client.score(request)).isInstanceOf(AiServiceException.class);server.verify(1,postRequestedFor(urlEqualTo("/score")));}
 @Test void timeoutRetriesThenFails(){server.stubFor(post("/score").willReturn(okJson(success()).withFixedDelay(500)));assertThatThrownBy(()->client.score(request)).isInstanceOf(AiServiceException.class);server.verify(2,postRequestedFor(urlEqualTo("/score")));}
 @Test void connectionRefusedRetriesThenFails(){client=new AiClient(new AiClientConfig().aiRestClient("http://127.0.0.1:1","token",50,50));assertThatThrownBy(()->client.score(request)).isInstanceOf(AiServiceException.class);}
 @Test void summarizeIsNeverRetriedAndDegrades(){server.stubFor(post("/summarize").willReturn(serverError()));var response=client.summarize(new SummaryRequest("r1","text","job",List.of(),List.of()));assertThat(response.degraded()).isTrue();server.verify(1,postRequestedFor(urlEqualTo("/summarize")));}
 private static String success(){return "{\"results\":[{\"resumeId\":\"r1\",\"score\":82,\"semanticScore\":0.7913,\"skillScore\":0.8,\"matchedSkills\":[\"java\"],\"missingSkills\":[]}],\"modelVersion\":\"all-MiniLM-L6-v2@1110a24\",\"weights\":{\"semantic\":0.7,\"skill\":0.3},\"durationMs\":842}";}
}
