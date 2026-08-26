package com.screener.api.service;

import static org.assertj.core.api.Assertions.*;
import com.screener.api.model.Resume;
import java.io.ByteArrayOutputStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.junit.jupiter.api.Test;

class PdfTextExtractorTest {
 private final PdfTextExtractor extractor=new PdfTextExtractor();
 @Test void extractsTextAndPageCount() throws Exception {try(var doc=new PDDocument();var out=new ByteArrayOutputStream()){var page=new PDPage();doc.addPage(page);try(var content=new PDPageContentStream(doc,page)){content.beginText();content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA),12);content.newLineAtOffset(50,700);content.showText("Omar Khalil omar@example.com");content.endText();}doc.save(out);var result=extractor.extract(out.toByteArray());assertThat(result.status()).isEqualTo(Resume.ParseStatus.PARSED);assertThat(result.text()).contains("Omar Khalil");assertThat(result.pageCount()).isEqualTo(1);}}
 @Test void imageOnlyPdfIsEmpty() throws Exception {try(var doc=new PDDocument();var out=new ByteArrayOutputStream()){doc.addPage(new PDPage());doc.save(out);assertThat(extractor.extract(out.toByteArray()).status()).isEqualTo(Resume.ParseStatus.EMPTY);}}
 @Test void corruptPdfIsStoredAsFailed(){var result=extractor.extract("%PDF-corrupt".getBytes());assertThat(result.status()).isEqualTo(Resume.ParseStatus.FAILED);assertThat(result.error()).isNotBlank();}
}
