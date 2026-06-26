import { Module } from '@nestjs/common';
import { ButtonsService } from './buttons.service';
import { ButtonsController } from './buttons.controller';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';

@Module({
  providers: [ButtonsService, TemplatesService, AssignmentsService],
  controllers: [ButtonsController, TemplatesController, AssignmentsController],
  exports: [ButtonsService, TemplatesService, AssignmentsService],
})
export class MarketingModule {}
