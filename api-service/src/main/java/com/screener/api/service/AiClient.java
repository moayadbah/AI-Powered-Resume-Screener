package com.screener.api.service;

import com.screener.api.dto.AiDtos.*;
import com.screener.api.exception.AiServiceException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Service
public class AiClient {
 private static final Logger log=LoggerFactory.getLogger(AiClient.class);private final RestClient client;
 public AiClient(RestClient aiRestClient){this.client=aiRestClient;}
 public ScoreResponse score(ScoreRequest request){
   for(int attempt=0;attempt<2;attempt++){try{return client.post().uri("/score").body(request).retrieve()
      .onStatus(HttpStatusCode::is4xxClientError,(req,res)->{throw new NonRetryableAiException();})
      .body(ScoreResponse.class);}catch(NonRetryableAiException ex){throw new AiServiceException(ex);}catch(RestClientException ex){if(attempt==1)throw new AiServiceException(ex);try{Thread.sleep(500);}catch(InterruptedException ie){Thread.currentThread().interrupt();throw new AiServiceException(ie);}}}
   throw new AiServiceException();
 }
 public SummaryResponse summarize(SummaryRequest request){try{return client.post().uri("/summarize").body(request).retrieve().body(SummaryResponse.class);}catch(RestClientException ex){return new SummaryResponse(request.resumeId(),null,null,null,true,"ai_service_unavailable",null,null);}}
 public ModelInfo modelInfo(){try{return client.get().uri("/model-info").retrieve().body(ModelInfo.class);}catch(RestClientException ex){log.warn("ai-service model info unavailable at startup");return null;}}
 private static final class NonRetryableAiException extends RuntimeException {}
}
