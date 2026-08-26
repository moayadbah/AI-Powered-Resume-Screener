package com.screener.api.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "Request validation failed"),
    MALFORMED_JSON(HttpStatus.BAD_REQUEST, "Malformed JSON request"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "Authentication is required"),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "Invalid email or password"),
    INVALID_SERVICE_TOKEN(HttpStatus.UNAUTHORIZED, "Invalid service token"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "You do not have access to this resource"),
    JOB_NOT_FOUND(HttpStatus.NOT_FOUND, "Job not found"),
    RESUME_NOT_FOUND(HttpStatus.NOT_FOUND, "Resume not found"),
    EMAIL_ALREADY_REGISTERED(HttpStatus.CONFLICT, "Email is already registered"),
    PAYLOAD_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "Uploaded file is too large"),
    UNSUPPORTED_FILE_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only PDF files are supported"),
    TOO_MANY_FILES(HttpStatus.UNPROCESSABLE_ENTITY, "Too many files"),
    BATCH_TOO_LARGE(HttpStatus.UNPROCESSABLE_ENTITY, "Screening batch is too large"),
    NO_SCOREABLE_RESUMES(HttpStatus.UNPROCESSABLE_ENTITY, "No scoreable resumes"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred"),
    AI_SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "AI service is unavailable"),
    MODEL_NOT_READY(HttpStatus.SERVICE_UNAVAILABLE, "Model is not ready");

    private final HttpStatus status;
    private final String defaultMessage;
    ErrorCode(HttpStatus status, String defaultMessage) { this.status = status; this.defaultMessage = defaultMessage; }
    public HttpStatus status() { return status; }
    public String defaultMessage() { return defaultMessage; }
}
