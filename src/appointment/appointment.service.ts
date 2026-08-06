import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (appointmentDate < today) {
    throw new BadRequestException(
      'Appointments can only be booked for future dates',
    );
  }

  // Validate slot exists for STREAM scheduling
  if (doctor.schedulingType === 'STREAM') {
    if (!dto.startTime || !dto.endTime) {
      throw new BadRequestException(
        'Start time and end time are required',
      );
    }

    const customAvailability =
      await this.prisma.customAvailability.findMany({
        where: {
          doctorId: doctor.id,
          date: appointmentDate,
        },
      });

    let slotExists = false;

    if (customAvailability.length > 0) {
      slotExists = customAvailability.some(
        (slot) =>
          slot.startTime === dto.startTime &&
          slot.endTime === dto.endTime,
      );
    } else {
      const weekdays = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];

      const recurringAvailability =
        await this.prisma.recurringAvailability.findMany({
          where: {
            doctorId: doctor.id,
            day: weekdays[appointmentDate.getDay()] as any,
          },
        });

      slotExists = recurringAvailability.some(
        (slot) =>
          slot.startTime === dto.startTime &&
          slot.endTime === dto.endTime,
      );
    }

    if (!slotExists) {
      throw new BadRequestException(
        'Selected slot is not available for this doctor',
      );
    }
  }

  const existing = await this.prisma.appointment.findFirst({
  where: {
    patientId: patient.id,
    doctorId: doctor.id,
    date: appointmentDate,
    status: 'BOOKED',
  },
});

  if (existing) {
    throw new ConflictException(
      'Appointment already booked for this doctor on this date',
    );
  }

  if (doctor.schedulingType === 'STREAM') {
    const slotAlreadyBooked =
      await this.prisma.appointment.findFirst({
        where: {
          doctorId: doctor.id,
          date: appointmentDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          status: 'BOOKED',
        },
      });

    if (slotAlreadyBooked) {
      throw new ConflictException(
        'This time slot is already booked',
      );
    }
    

    const bookedCount = await this.prisma.appointment.count({
  where: {
    doctorId: doctor.id,
    date: appointmentDate,
    status: 'BOOKED',
  },
});

const token = bookedCount + 1;

    return this.prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        date: appointmentDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        tokenNumber: token,
      },
    });
  }

  // WAVE scheduling
  const bookedCount = await this.prisma.appointment.count({
    where: {
      doctorId: doctor.id,
      date: appointmentDate,
      status: 'BOOKED',
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
  async getMyAppointments(userId: string) {
  const patient = await this.prisma.patientProfile.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw new NotFoundException('Patient profile not found');
  }

  const appointments = await this.prisma.appointment.findMany({
    where: {
      patientId: patient.id,
    },
    include: {
      doctor: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  if (appointments.length === 0) {
    throw new NotFoundException('No appointments found');
  }

  return appointments;
}

async cancelAppointment(userId: string, appointmentId: string) {
  const patient = await this.prisma.patientProfile.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw new NotFoundException('Patient profile not found');
  }

  const appointment = await this.prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new NotFoundException('Appointment not found');
  }

  if (appointment.patientId !== patient.id) {
    throw new ConflictException(
      'You are not allowed to cancel this appointment',
    );
  }

  if (appointment.status === 'CANCELLED') {
    throw new ConflictException(
      'Appointment already cancelled',
    );
  }

  const appointmentDateTime = new Date(appointment.date);

if (appointment.startTime) {
  const [hours, minutes] = appointment.startTime
    .split(':')
    .map(Number);

  appointmentDateTime.setHours(hours, minutes, 0, 0);
}

const diffInMinutes =
  (appointmentDateTime.getTime() - Date.now()) / (1000 * 60);

if (diffInMinutes < 30) {
  throw new BadRequestException(
    'Appointments cannot be cancelled within 30 minutes of the scheduled time',
  );
}

  return this.prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'CANCELLED',
    },
  });
}

async rescheduleAppointment(
  userId: string,
  appointmentId: string,
  dto: RescheduleAppointmentDto,
) {
  const patient = await this.prisma.patientProfile.findUnique({
    where: { userId },
  });

  if (!patient) {
    throw new NotFoundException('Patient profile not found');
  }

  const appointment = await this.prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: true,
    },
  });

  if (!appointment) {
    throw new NotFoundException('Appointment not found');
  }

  if (appointment.patientId !== patient.id) {
    throw new ConflictException(
      'You are not allowed to reschedule this appointment',
    );
  }

  if (appointment.status === 'CANCELLED') {
    throw new ConflictException(
      'Cancelled appointments cannot be rescheduled',
    );
  }

  const appointmentDateTime = new Date(appointment.date);

if (appointment.startTime) {
  const [hours, minutes] = appointment.startTime
    .split(':')
    .map(Number);

  appointmentDateTime.setHours(hours, minutes, 0, 0);
}

const diffInMinutes =
  (appointmentDateTime.getTime() - Date.now()) / (1000 * 60);

if (diffInMinutes < 30) {
  throw new BadRequestException(
    'Appointments cannot be rescheduled within 30 minutes of the scheduled time',
  );
}

  // Get doctor before using it
  const doctor = appointment.doctor;

  const newDate = new Date(dto.date);

  if (
  appointment.date.toDateString() === newDate.toDateString() &&
  appointment.startTime === dto.startTime &&
  appointment.endTime === dto.endTime
) {
  throw new BadRequestException(
    'Appointment is already scheduled for this slot',
  );
}

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (newDate < today) {
    throw new BadRequestException(
      'Appointments can only be rescheduled to a future date',
    );
  }

  // Prevent duplicate appointment with same doctor on same date
  const existingAppointment = await this.prisma.appointment.findFirst({
    where: {
      patientId: patient.id,
      doctorId: doctor.id,
      date: newDate,
      status: 'BOOKED',
      NOT: {
        id: appointment.id,
      },
    },
  });

  if (existingAppointment) {
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

    const customAvailability =
      await this.prisma.customAvailability.findMany({
        where: {
          doctorId: doctor.id,
          date: newDate,
        },
      });

    let slotExists = false;

    if (customAvailability.length > 0) {
      slotExists = customAvailability.some(
        (slot) =>
          slot.startTime === dto.startTime &&
          slot.endTime === dto.endTime,
      );
    } else {
      const weekdays = [
        'SUNDAY',
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
      ];

      const recurringAvailability =
        await this.prisma.recurringAvailability.findMany({
          where: {
            doctorId: doctor.id,
            day: weekdays[newDate.getDay()] as any,
          },
        });

      slotExists = recurringAvailability.some(
        (slot) =>
          slot.startTime === dto.startTime &&
          slot.endTime === dto.endTime,
      );
    }

    if (!slotExists) {
      throw new BadRequestException(
        'Selected slot is not available for this doctor',
      );
    }

    const slotAlreadyBooked =
      await this.prisma.appointment.findFirst({
        where: {
          doctorId: doctor.id,
          date: newDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          status: 'BOOKED',
          NOT: {
            id: appointment.id,
          },
        },
      });

    if (slotAlreadyBooked) {
      throw new ConflictException(
        'This time slot is already booked',
      );
    }

    const bookedCount = await this.prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        date: newDate,
        status: 'BOOKED',
        NOT: {
          id: appointment.id,
        },
      },
    });

    const token = bookedCount + 1;

    return this.prisma.appointment.update({
      where: {
        id: appointment.id,
      },
      data: {
        date: newDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        tokenNumber: token,
      },
    });
  }

  // WAVE scheduling
  const bookedCount = await this.prisma.appointment.count({
    where: {
      doctorId: doctor.id,
      date: newDate,
      status: 'BOOKED',
      NOT: {
        id: appointment.id,
      },
    },
  });

  if (bookedCount >= (doctor.waveCapacity ?? 0)) {
    throw new ConflictException('Selected wave is full. Please choose another time.');
  }

  return this.prisma.appointment.update({
    where: {
      id: appointment.id,
    },
    data: {
      date: newDate,
      tokenNumber: bookedCount + 1,
      startTime: null,
      endTime: null,
    },
  });
}
}