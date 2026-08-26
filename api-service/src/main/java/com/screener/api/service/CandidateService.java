package com.screener.api.service;

import com.screener.api.dto.CandidateDtos.*;
import com.screener.api.dto.JobDtos.PageResponse;
import com.screener.api.exception.ApiException;
import com.screener.api.exception.ErrorCode;
import com.screener.api.model.Resume;
import com.screener.api.model.Screening;
import com.screener.api.repository.JobRepository;
import com.screener.api.repository.ResumeRepository;
import com.screener.api.repository.ScreeningRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class CandidateService {
 private final JobService jobs;private final JobRepository jobRepo;private final ResumeRepository resumes;private final ScreeningRepository screenings;
 public CandidateService(JobService jobs,JobRepository jobRepo,ResumeRepository resumes,ScreeningRepository screenings){this.jobs=jobs;this.jobRepo=jobRepo;this.resumes=resumes;this.screenings=screenings;}
 public PageResponse<Candidate> list(String jobId,String userId,String sort,String order,int page,int size){jobs.requireOwned(jobId,userId);validateSort(sort,order);List<Resume> rs=resumes.findByJobId(jobId);Map<String,Screening> sm=screenings.findByJobId(jobId).stream().collect(Collectors.toMap(Screening::resumeId,Function.identity()));
   Comparator<Candidate> value=switch(sort){case "name"->Comparator.comparing(Candidate::candidateName,String.CASE_INSENSITIVE_ORDER);case "uploadedAt"->Comparator.comparing(Candidate::uploadedAt);default->Comparator.comparingInt(c->c.screening()==null?0:c.screening().score());};if("desc".equals(order))value=value.reversed();
   Comparator<Candidate> cmp=Comparator.comparing((Candidate c)->c.screening()==null).thenComparing(value).thenComparing(Candidate::resumeId);List<Candidate> all=rs.stream().map(r->map(r,sm.get(r.id()))).sorted(cmp).toList();int from=Math.min(page*size,all.size()),to=Math.min(from+size,all.size());return new PageResponse<>(all.subList(from,to),page,size,all.size(),(int)Math.ceil(all.size()/(double)size));}
 public CandidateDetail detail(String resumeId,String userId){Resume r=resumes.findById(resumeId).orElseThrow(()->new ApiException(ErrorCode.RESUME_NOT_FOUND,"No resume with id "+resumeId));var job=jobRepo.findById(r.jobId()).orElseThrow(()->new ApiException(ErrorCode.RESUME_NOT_FOUND));if(!job.createdBy().equals(userId))throw new ApiException(ErrorCode.FORBIDDEN);Screening s=screenings.findByJobIdAndResumeId(r.jobId(),r.id()).orElse(null);return new CandidateDetail(r.id(),job.id(),job.title(),r.candidateName(),r.candidateEmail(),r.originalFilename(),r.parseStatus(),r.pageCount(),r.uploadedAt(),detail(s));}
 private static Candidate map(Resume r,Screening s){return new Candidate(r.id(),r.candidateName(),r.candidateEmail(),r.originalFilename(),r.parseStatus(),r.uploadedAt(),summary(s));}
 private static ScreeningSummary summary(Screening s){return s==null?null:new ScreeningSummary(s.score(),s.semanticScore(),s.skillScore(),s.matchedSkills(),s.missingSkills(),s.summaryDegraded(),s.scoredAt());}
 private static ScreeningDetail detail(Screening s){return s==null?null:new ScreeningDetail(s.score(),s.semanticScore(),s.skillScore(),s.matchedSkills(),s.missingSkills(),s.summaryDegraded(),s.scoredAt(),s.summary(),s.strengths(),s.concerns(),s.modelVersion(),s.promptVersion(),s.weights());}
 private static void validateSort(String sort,String order){if(!List.of("score","name","uploadedAt").contains(sort)||!List.of("asc","desc").contains(order))throw new ApiException(ErrorCode.VALIDATION_FAILED);}
}
