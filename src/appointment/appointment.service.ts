import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';

@Injectable()
export class AppointmentService {
  constructor(private readonly prisma: PrismaService) {}

  async bookAppointment(userId: string, dto: BookAppointmentDto) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: dto.doctorId },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }

    const appointmentDate = new Date(dto.date);

    const existing = await this.prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        doctorId: doctor.id,
        date: appointmentDate,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Appointment already booked for this doctor on this date',
      );
    }

    // STREAM scheduling
    if (doctor.schedulingType === 'STREAM') {
      if (!dto.startTime || !dto.endTime) {
        throw new BadRequestException(
          'Start time and end time are required',
        );
      }
    const slotAlreadyBooked = await this.prisma.appointment.findFirst({
  where: {
    doctorId: doctor.id,
    date: appointmentDate,
    startTime: dto.startTime,
    endTime: dto.endTime,
  },
});

if (slotAlreadyBooked) {
  throw new ConflictException('This time slot is already booked');
}
      return this.prisma.appointment.create({
        data: {
          doctorId: doctor.id,
          patientId: patient.id,
          date: appointmentDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
        },
      });
    }

    // WAVE scheduling
    const bookedCount = await this.prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        date: appointmentDate,
      },
    });

    if (bookedCount >= (doctor.waveCapacity ?? 0)) {
      throw new ConflictException('Wave is full');
    }

    const token = bookedCount + 1;

    return this.prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        date: appointmentDate,
        tokenNumber: token,
      },
    });
  }
}