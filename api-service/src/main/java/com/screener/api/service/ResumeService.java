package com.screener.api.service;

import com.screener.api.dto.ResumeDtos.*;
import com.screener.api.exception.ApiException;
import com.screener.api.exception.ErrorCode;
import com.screener.api.model.Resume;
import com.screener.api.repository.ResumeRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.bson.types.ObjectId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ResumeService {
    private static final byte[] PDF="%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final Pattern EMAIL=Pattern.compile("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}",Pattern.CASE_INSENSITIVE);
    private final JobService jobs; private final ResumeRepository resumes; private final FileStorageService storage; private final PdfTextExtractor extractor;
    private final int maxFiles; private final long maxBytes;
    public ResumeService(JobService jobs,ResumeRepository resumes,FileStorageService storage,PdfTextExtractor extractor,
        @Value("${app.upload.max-files-per-request}") int maxFiles,@Value("${app.upload.max-size-mb}") long maxMb){this.jobs=jobs;this.resumes=resumes;this.storage=storage;this.extractor=extractor;this.maxFiles=maxFiles;this.maxBytes=maxMb*1024*1024;}
    public UploadResponse upload(String jobId,String userId,MultipartFile[] files){
        jobs.requireOwned(jobId,userId); if(files.length>maxFiles)throw new ApiException(ErrorCode.TOO_MANY_FILES);
        var uploaded=new ArrayList<UploadedResume>();var rejected=new ArrayList<RejectedFile>();
        for(MultipartFile file:files){String filename=file.getOriginalFilename()==null?"unnamed.pdf":file.getOriginalFilename();
            try{byte[] bytes=file.getBytes(); if(bytes.length>maxBytes){rejected.add(new RejectedFile(filename,ErrorCode.PAYLOAD_TOO_LARGE.name()));continue;}
                if(!isPdf(bytes)){rejected.add(new RejectedFile(filename,ErrorCode.UNSUPPORTED_FILE_TYPE.name()));continue;}
                String id=new ObjectId().toHexString();String path=storage.store(jobId,id,bytes);var parsed=extractor.extract(bytes);Instant now=Instant.now();
                String name=candidateName(parsed.text(),filename);String email=candidateEmail(parsed.text());String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
                Resume resume=resumes.save(new Resume(id,jobId,name,email,filename,path,hash,parsed.status()==Resume.ParseStatus.PARSED?parsed.text():"",parsed.pageCount(),parsed.status(),parsed.error(),bytes.length,userId,now));
                uploaded.add(new UploadedResume(resume.id(),resume.candidateName(),resume.originalFilename(),resume.parseStatus(),resume.pageCount(),resume.sizeBytes(),resume.uploadedAt()));
            }catch(Exception ex){throw new RuntimeException("Failed to store upload",ex);}}
        return new UploadResponse(uploaded,rejected);
    }
    private static boolean isPdf(byte[] b){if(b.length<PDF.length)return false;for(int i=0;i<PDF.length;i++)if(b[i]!=PDF[i])return false;return true;}
    private static String candidateEmail(String text){Matcher m=EMAIL.matcher(text);return m.find()?m.group():null;}
    private static String candidateName(String text,String filename){for(String line:text.split("\\R")){String s=line.trim();if(!s.isBlank()){if(s.length()<60&&!s.contains("@")&&!s.matches(".*\\d.*"))return s;break;}}return filename.replaceFirst("(?i)\\.pdf$","");}
}
