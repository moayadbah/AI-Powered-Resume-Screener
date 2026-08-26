package com.screener.api.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class FileStorageService {
    private final Path root;
    public FileStorageService(@Value("${app.upload.dir}") String root){this.root=Path.of(root).toAbsolutePath().normalize();}
    public String store(String jobId,String resumeId,byte[] bytes) throws IOException{
        String relative=jobId+"/"+resumeId+".pdf"; Path destination=root.resolve(relative).normalize();
        if(!destination.startsWith(root))throw new SecurityException("Invalid storage path");
        Files.createDirectories(destination.getParent()); Files.write(destination,bytes); return relative.replace('\\','/');
    }
    Path resolve(String relative){return root.resolve(relative).normalize();}
}
