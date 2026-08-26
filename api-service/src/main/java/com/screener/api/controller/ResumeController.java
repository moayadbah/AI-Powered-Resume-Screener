package com.screener.api.controller;
import com.screener.api.dto.ResumeDtos.UploadResponse;
import com.screener.api.security.CurrentUser;
import com.screener.api.service.ResumeService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
@RestController @RequestMapping("/api/jobs/{id}/resumes")
public class ResumeController {private final ResumeService service;public ResumeController(ResumeService service){this.service=service;}
 @PostMapping @ResponseStatus(HttpStatus.CREATED) UploadResponse upload(@PathVariable String id,@RequestPart("files") MultipartFile[] files,@AuthenticationPrincipal CurrentUser u){return service.upload(id,u.id(),files);}}
