import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DoctorModule } from './doctor/doctor.module';
import { PatientModule } from './patient/patient.module';
import { AppointmentModule } from './appointment/appointment.module';

@Module({
  imports: [PrismaModule, AuthModule, DoctorModule, PatientModule, AppointmentModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
