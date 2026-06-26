import { Module } from '@nestjs/common';
import { ListenerService } from './listener.service';
import { ListenerController } from './listener.controller';
import { ListenerGatewayService } from './listener-gateway.service';

@Module({
  providers: [ListenerService, ListenerGatewayService],
  controllers: [ListenerController],
  exports: [ListenerService],
})
export class ListenerModule {}
