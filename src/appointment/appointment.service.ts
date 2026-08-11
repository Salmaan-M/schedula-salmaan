import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SlotGeneratorService } from '../scheduling/slot-generator.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotGenerator: SlotGeneratorService,
  ) {}

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

    const availability = await this.getAvailabilityForDate(
      doctor.id,
      appointmentDate,
    );

    // ensure slots are generated & persisted
    const generatedSlots = await this.slotGenerator.getGeneratedSlots(
      doctor,
      availability,
      appointmentDate,
    );

    if (
      !this.slotGenerator.isSlotAvailable(
        generatedSlots,
        dto.startTime,
        dto.endTime,
      )
    ) {
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
    // Use persistent Slot for STREAM bookings
    const normalizedDate = new Date(
      appointmentDate.getFullYear(),
      appointmentDate.getMonth(),
      appointmentDate.getDate(),
    );

    const slot = await this.prisma.slot.findFirst({
      where: {
        doctorId: doctor.id,
        date: normalizedDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });

    if (!slot) {
      throw new BadRequestException('Selected slot does not exist');
    }

    if (slot.status !== 'AVAILABLE') {
      throw new ConflictException('This time slot is already booked');
    }

    const bookedCount = await this.prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        date: normalizedDate,
        status: 'BOOKED',
      },
    });

    const token = bookedCount + 1;

    // Transaction: create appointment then claim slot
    return this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.create({
        data: {
          doctorId: doctor.id,
          patientId: patient.id,
          date: normalizedDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          tokenNumber: token,
        },
      });

      const updated = await tx.slot.updateMany({
        where: { id: slot.id, status: 'AVAILABLE', appointmentId: null },
        data: { status: 'BOOKED', appointmentId: appointment.id },
      });

      if (updated.count === 0) {
        throw new ConflictException('Slot was just booked by someone else');
      }

      return appointment;
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
  private async getAvailabilityForDate(
    doctorId: string,
    date: Date,
  ) {
    const customAvailability =
      await this.prisma.customAvailability.findMany({
        where: {
          doctorId,
          date,
        },
      });

    if (customAvailability.length > 0) {
      return customAvailability;
    }

    const weekdays = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];

    return this.prisma.recurringAvailability.findMany({
      where: {
        doctorId,
        day: weekdays[date.getDay()] as any,
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

  // If appointment has an associated slot, release it transactionally
  return this.prisma.$transaction(async (tx) => {
    const updatedAppointment = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELLED',
      },
    });

    await tx.slot.updateMany({
      where: { appointmentId: appointmentId },
      data: { status: 'AVAILABLE', appointmentId: null },
    });

    return updatedAppointment;
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

    const availability = await this.getAvailabilityForDate(
      doctor.id,
      newDate,
    );

    const generatedSlots = await this.slotGenerator.getGeneratedSlots(
      doctor,
      availability,
      newDate,
    );

    if (
      !this.slotGenerator.isSlotAvailable(
        generatedSlots,
        dto.startTime,
        dto.endTime,
      )
    ) {
      throw new BadRequestException(
        'Selected slot is not available for this doctor',
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

    // Find the requested new slot
    const normalizedNewDate = new Date(
      newDate.getFullYear(),
      newDate.getMonth(),
      newDate.getDate(),
    );

    const newSlot = await this.prisma.slot.findFirst({
      where: {
        doctorId: doctor.id,
        date: normalizedNewDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });

    if (!newSlot) {
      throw new BadRequestException('Selected slot does not exist');
    }

    if (newSlot.status !== 'AVAILABLE') {
      throw new ConflictException('Selected slot is not available');
    }

    // Transaction: claim new slot, release old slot, update appointment
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.slot.updateMany({
        where: { id: newSlot.id, status: 'AVAILABLE', appointmentId: null },
        data: { status: 'BOOKED', appointmentId: appointment.id },
      });

      if (claimed.count === 0) {
        throw new ConflictException('Failed to claim new slot');
      }

      await tx.slot.updateMany({
        where: { appointmentId: appointment.id },
        data: { status: 'AVAILABLE', appointmentId: null },
      });

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          date: normalizedNewDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          tokenNumber: token,
        },
      });
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