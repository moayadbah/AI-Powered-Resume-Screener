package com.screener.api.repository;
import com.screener.api.model.Screening;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;
public interface ScreeningRepository extends MongoRepository<Screening, String> {
    List<Screening> findByJobId(String jobId);
    Optional<Screening> findByJobIdAndResumeId(String jobId, String resumeId);
    Optional<Screening> findTopByJobIdOrderByScoredAtDesc(String jobId);
    long countByJobId(String jobId);
}
