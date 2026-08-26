package com.screener.api.dto;
import java.time.Instant;
public final class ScreenDtos {private ScreenDtos(){} public record ScreenResponse(String jobId,int screened,int skipped,int summariesDegraded,String modelVersion,long durationMs,Instant screenedAt){} }
