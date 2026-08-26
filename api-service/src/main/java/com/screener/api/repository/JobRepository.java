package com.screener.api.repository;
import com.screener.api.model.Job;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;
public interface JobRepository extends MongoRepository<Job, String> { Page<Job> findByCreatedBy(String createdBy, Pageable pageable); }
