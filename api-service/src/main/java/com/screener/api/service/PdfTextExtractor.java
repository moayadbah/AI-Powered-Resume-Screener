package com.screener.api.service;

import com.screener.api.model.Resume;
import java.io.IOException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

@Service
public class PdfTextExtractor {
    private static final int MAX_PAGES=20;
    public Result extract(byte[] bytes){
        try(PDDocument doc=Loader.loadPDF(bytes)){
            if(doc.isEncrypted())return new Result("",0,Resume.ParseStatus.FAILED,"Encrypted PDF");
            PDFTextStripper stripper=new PDFTextStripper(); stripper.setSortByPosition(true); stripper.setEndPage(Math.min(doc.getNumberOfPages(),MAX_PAGES));
            String text=stripper.getText(doc).trim(); return new Result(text,doc.getNumberOfPages(),text.isBlank()?Resume.ParseStatus.EMPTY:Resume.ParseStatus.PARSED,null);
        }catch(IOException|RuntimeException ex){return new Result("",0,Resume.ParseStatus.FAILED,safeMessage(ex));}
    }
    private static String safeMessage(Exception ex){String m=ex.getMessage();return m==null?ex.getClass().getSimpleName():m.substring(0,Math.min(m.length(),500));}
    public record Result(String text,int pageCount,Resume.ParseStatus status,String error){}
}
