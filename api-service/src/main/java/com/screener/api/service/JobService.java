package com.screener.api.service;

import com.screener.api.dto.JobDtos.*;
import com.screener.api.exception.ApiException;
import com.screener.api.exception.ErrorCode;
import com.screener.api.model.Job;
import com.screener.api.model.Resume;
import com.screener.api.repository.JobRepository;
import com.screener.api.repository.ResumeRepository;
import com.screener.api.repository.ScreeningRepository;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

@Service
public class JobService {
    private final JobRepository jobs; private final ResumeRepository resumes; private final ScreeningRepository screenings;
    public JobService(JobRepository jobs, ResumeRepository resumes, ScreeningRepository screenings){this.jobs=jobs;this.resumes=resumes;this.screenings=screenings;}
    public JobResponse create(CreateJobRequest r,String userId){
        List<String> skills=r.requiredSkills()==null?List.of():new LinkedHashSet<>(r.requiredSkills().stream().map(s->s.trim().toLowerCase(Locale.ROOT)).toList()).stream().toList();
        Instant now=Instant.now(); Job j=jobs.save(new Job(null,r.title().trim(),r.description().trim(),skills,blankToNull(r.location()),userId,now,now)); return detail(j);
    }
    public PageResponse<JobSummary> list(String userId,int page,int size){
        var result=jobs.findByCreatedBy(userId,PageRequest.of(page,size,Sort.by(Sort.Direction.DESC,"createdAt")));
        return new PageResponse<>(result.stream().map(this::summary).toList(),page,size,result.getTotalElements(),result.getTotalPages());
    }
    public JobResponse get(String id,String userId){return detail(requireOwned(id,userId));}
    public Job requireOwned(String id,String userId){
        Job j=jobs.findById(id).orElseThrow(()->new ApiException(ErrorCode.JOB_NOT_FOUND,"No job with id "+id));
        if(!j.createdBy().equals(userId))throw new ApiException(ErrorCode.FORBIDDEN); return j;
    }
    private JobResponse detail(Job j){
        long rc=resumes.countByJobId(j.id()),sc=screenings.countByJobId(j.id());
        long uc=resumes.countByJobIdAndParseStatusIn(j.id(),List.of(Resume.ParseStatus.EMPTY,Resume.ParseStatus.FAILED));
        Instant last=screenings.findTopByJobIdOrderByScoredAtDesc(j.id()).map(s->s.scoredAt()).orElse(null);
        return new JobResponse(j.id(),j.title(),j.description(),j.requiredSkills(),j.location(),j.createdAt(),j.updatedAt(),rc,sc,uc,last);
    }
    private JobSummary summary(Job j){return new JobSummary(j.id(),j.title(),j.location(),j.requiredSkills(),j.createdAt(),resumes.countByJobId(j.id()),screenings.countByJobId(j.id()));}
    private static String blankToNull(String s){return s==null||s.isBlank()?null:s.trim();}
}
