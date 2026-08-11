import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SlotGeneratorService } from './slot-generator.service';

@Module({
  imports: [PrismaModule],
  providers: [SlotGeneratorService],
  exports: [SlotGeneratorService],
})
export class SchedulingModule {}