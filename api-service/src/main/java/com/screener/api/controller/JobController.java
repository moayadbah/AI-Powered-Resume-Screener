package com.screener.api.controller;

import com.screener.api.dto.JobDtos.*;
import com.screener.api.dto.ScreenDtos.ScreenResponse;
import com.screener.api.security.CurrentUser;
import com.screener.api.service.JobService;
import com.screener.api.service.ScreeningService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated @RestController @RequestMapping("/api/jobs")
public class JobController {
    private final JobService jobs; private final ScreeningService screening;
    public JobController(JobService jobs,ScreeningService screening){this.jobs=jobs;this.screening=screening;}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) JobResponse create(@Valid @RequestBody CreateJobRequest r,@AuthenticationPrincipal CurrentUser u){return jobs.create(r,u.id());}
    @GetMapping PageResponse<JobSummary> list(@RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="20") @Min(1) @Max(100) int size,@AuthenticationPrincipal CurrentUser u){return jobs.list(u.id(),page,size);}
    @GetMapping("/{id}") JobResponse get(@PathVariable String id,@AuthenticationPrincipal CurrentUser u){return jobs.get(id,u.id());}
    @PostMapping("/{id}/screen") ScreenResponse screen(@PathVariable String id,@AuthenticationPrincipal CurrentUser u){return screening.screen(id,u.id());}
}
