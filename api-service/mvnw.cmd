@echo off
setlocal
set "MVNW_PROJECTBASEDIR=%~dp0"
set "MVNW_MAVEN_VERSION=3.9.9"
set "MVNW_HOME=%USERPROFILE%\.m2\wrapper\dists\apache-maven-%MVNW_MAVEN_VERSION%"
set "MVNW_MVN=%MVNW_HOME%\apache-maven-%MVNW_MAVEN_VERSION%\bin\mvn.cmd"
if not exist "%MVNW_MVN%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $d='%MVNW_HOME%'; New-Item -ItemType Directory -Force -Path $d | Out-Null; $z=Join-Path $d 'maven.zip'; Invoke-WebRequest 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/%MVNW_MAVEN_VERSION%/apache-maven-%MVNW_MAVEN_VERSION%-bin.zip' -OutFile $z; Expand-Archive -Force $z $d; Remove-Item $z"
  if errorlevel 1 exit /b 1
)
call "%MVNW_MVN%" %*
