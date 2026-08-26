package com.screener.api.config;
import jakarta.annotation.PostConstruct;import org.springframework.data.domain.Sort;import org.springframework.data.mongodb.core.MongoTemplate;import org.springframework.data.mongodb.core.index.Index;import org.springframework.stereotype.Component;
@Component public class MongoIndexConfig {private final MongoTemplate mongo;public MongoIndexConfig(MongoTemplate mongo){this.mongo=mongo;}@PostConstruct void indexes(){
 mongo.indexOps("users").ensureIndex(new Index().on("email",Sort.Direction.ASC).unique());
 mongo.indexOps("jobs").ensureIndex(new Index().on("createdBy",Sort.Direction.ASC).on("createdAt",Sort.Direction.DESC));
 mongo.indexOps("resumes").ensureIndex(new Index().on("jobId",Sort.Direction.ASC));
 mongo.indexOps("resumes").ensureIndex(new Index().on("jobId",Sort.Direction.ASC).on("contentHash",Sort.Direction.ASC));
 mongo.indexOps("screenings").ensureIndex(new Index().on("jobId",Sort.Direction.ASC).on("resumeId",Sort.Direction.ASC).unique());
 mongo.indexOps("screenings").ensureIndex(new Index().on("jobId",Sort.Direction.ASC).on("score",Sort.Direction.DESC));}}
