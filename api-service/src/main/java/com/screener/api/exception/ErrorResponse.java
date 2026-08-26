package com.screener.api.exception;

import java.util.Map;

public record ErrorResponse(ErrorBody error) {
    public record ErrorBody(String code, String message, String traceId, Map<String, String> details) {}
    public static ErrorResponse of(ErrorCode code, String message, String traceId, Map<String, String> details) {
        return new ErrorResponse(new ErrorBody(code.name(), message, traceId, details));
    }
}
