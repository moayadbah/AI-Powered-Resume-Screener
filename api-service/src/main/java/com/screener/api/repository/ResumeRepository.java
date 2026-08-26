package com.screener.api.repository;
import com.screener.api.model.Resume;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;
public interface ResumeRepository extends MongoRepository<Resume, String> {
    List<Resume> findByJobId(String jobId);
    List<Resume> findByJobIdAndParseStatus(String jobId, Resume.ParseStatus status);
    long countByJobId(String jobId);
    long countByJobIdAndParseStatusIn(String jobId, List<Resume.ParseStatus> statuses);
}
