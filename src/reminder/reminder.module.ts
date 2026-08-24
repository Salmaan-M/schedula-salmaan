import { Module } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { DoctorModule } from '../doctor/doctor.module';

@Module({
  imports: [PrismaModule, NotificationModule, DoctorModule],
  providers: [ReminderService],
  exports: [ReminderService],
})
export class ReminderModule {}
