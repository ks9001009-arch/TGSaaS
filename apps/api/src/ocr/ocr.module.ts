import { Module } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { OcrBootstrapService } from './ocr-bootstrap.service';

@Module({
  providers: [OcrService, OcrBootstrapService],
  exports: [OcrService],
})
export class OcrModule {}
