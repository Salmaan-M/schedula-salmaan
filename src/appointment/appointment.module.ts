import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, SchedulingModule, NotificationModule],
  controllers: [AppointmentController],
  providers: [AppointmentService],
})
export class AppointmentModule {}