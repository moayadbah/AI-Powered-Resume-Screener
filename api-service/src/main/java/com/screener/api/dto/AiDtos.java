package com.screener.api.dto;

import java.util.List;

public final class AiDtos {
 private AiDtos(){}
 public record ResumeInput(String resumeId,String text){}
 public record ScoreRequest(String jobDescription,List<String> requiredSkills,List<ResumeInput> resumes){}
 public record ScoreResult(String resumeId,int score,double semanticScore,double skillScore,List<String> matchedSkills,List<String> missingSkills){}
 public record Weights(double semantic,double skill){}
 public record ScoreResponse(List<ScoreResult> results,String modelVersion,Weights weights,long durationMs){}
 public record SummaryRequest(String resumeId,String resumeText,String jobDescription,List<String> matchedSkills,List<String> missingSkills){}
 public record SummaryResponse(String resumeId,String summary,List<String> strengths,List<String> concerns,boolean degraded,String degradedReason,String promptVersion,String model){}
 public record ModelInfo(String embeddingModel,String embeddingRevision,String modelVersion,Integer dimensions,Integer maxSequenceLength,String ollamaModel,String promptVersion,Weights weights){}
}
