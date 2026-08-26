package com.screener.api.exception;

public class AiServiceException extends ApiException {
    public AiServiceException() { super(ErrorCode.AI_SERVICE_UNAVAILABLE); }
    public AiServiceException(Throwable cause) { super(ErrorCode.AI_SERVICE_UNAVAILABLE); initCause(cause); }
}
