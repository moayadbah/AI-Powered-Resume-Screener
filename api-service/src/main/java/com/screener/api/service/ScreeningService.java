package com.screener.api.service;

import com.screener.api.dto.AiDtos.*;
import com.screener.api.dto.ScreenDtos.ScreenResponse;
import com.screener.api.exception.ApiException;
import com.screener.api.exception.ErrorCode;
import com.screener.api.model.Resume;
import com.screener.api.model.Screening;
import com.screener.api.repository.ResumeRepository;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.mongodb.core.BulkOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

@Service
public class ScreeningService {
 private final JobService jobs;private final ResumeRepository resumes;private final AiClient ai;private final MongoTemplate mongo;private final int cap;
 public ScreeningService(JobService jobs,ResumeRepository resumes,AiClient ai,MongoTemplate mongo,@Value("${app.screening.max-resumes}") int cap){this.jobs=jobs;this.resumes=resumes;this.ai=ai;this.mongo=mongo;this.cap=cap;}
 public ScreenResponse screen(String jobId,String userId){long started=System.nanoTime();var job=jobs.requireOwned(jobId,userId);List<Resume> parsed=resumes.findByJobIdAndParseStatus(jobId,Resume.ParseStatus.PARSED);
   if(parsed.isEmpty())throw new ApiException(ErrorCode.NO_SCOREABLE_RESUMES);if(parsed.size()>cap)throw new ApiException(ErrorCode.BATCH_TOO_LARGE);
   ScoreResponse scores=ai.score(new ScoreRequest(job.description(),job.requiredSkills(),parsed.stream().map(r->new ResumeInput(r.id(),r.parsedText())).toList()));
   var byId=new HashMap<String,Resume>();parsed.forEach(r->byId.put(r.id(),r));var ops=mongo.bulkOps(BulkOperations.BulkMode.UNORDERED,Screening.class);int degraded=0;Instant scoredAt=Instant.now();
   for(ScoreResult score:scores.results()){Resume resume=byId.get(score.resumeId());if(resume==null)continue;SummaryResponse summary=ai.summarize(new SummaryRequest(resume.id(),resume.parsedText(),job.description(),score.matchedSkills(),score.missingSkills()));boolean d=summary==null||summary.degraded();if(d)degraded++;
     Query q=Query.query(Criteria.where("jobId").is(jobId).and("resumeId").is(resume.id()));Update u=new Update().set("jobId",jobId).set("resumeId",resume.id()).set("candidateName",resume.candidateName()).set("score",score.score()).set("semanticScore",score.semanticScore()).set("skillScore",score.skillScore()).set("matchedSkills",score.matchedSkills()).set("missingSkills",score.missingSkills()).set("summary",d?null:summary.summary()).set("strengths",d?null:summary.strengths()).set("concerns",d?null:summary.concerns()).set("summaryDegraded",d).set("modelVersion",scores.modelVersion()).set("promptVersion",summary==null?null:summary.promptVersion()).set("weights",new Screening.Weights(scores.weights().semantic(),scores.weights().skill())).set("scoredAt",scoredAt);ops.upsert(q,u);}
   ops.execute();int skipped=(int)(resumes.countByJobId(jobId)-parsed.size());return new ScreenResponse(jobId,parsed.size(),skipped,degraded,scores.modelVersion(),(System.nanoTime()-started)/1_000_000,scoredAt);
 }
}
