import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateAvailabilityOverrideDto } from './dto/create-availability-override.dto';
import { UpdateSchedulingDto } from './dto/update-scheduling.dto';

@Injectable()
export class DoctorService {
  constructor(private prisma: PrismaService) {}

   private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${hours.toString().padStart(2, '0')}:${mins
    .toString()
    .padStart(2, '0')}`;
}

  async createProfile(userId: string, dto: CreateDoctorProfileDto) {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException('Doctor profile already exists');
    }

    return this.prisma.doctorProfile.create({
      data: {
        ...dto,
        userId,
      },
    });
  }

  async getProfile(userId: string) {
  const profile = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new NotFoundException('Doctor profile not found');
  }

  return profile;
}

async updateProfile(userId: string, dto: UpdateDoctorProfileDto) {
  const profile = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    throw new NotFoundException('Doctor profile not found');
  }

  return this.prisma.doctorProfile.update({
    where: { userId },
    data: dto,
  });
}

async createAvailability(userId: string, dto: CreateAvailabilityDto) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  const start = this.timeToMinutes(dto.startTime);
  const end = this.timeToMinutes(dto.endTime);

  if (start >= end) {
    throw new BadRequestException(
      'Start time must be before end time',
    );
  }

  const slots = await this.prisma.recurringAvailability.findMany({
    where: {
      doctorId: doctor.id,
      day: dto.day,
    },
  });

  for (const slot of slots) {
    const existingStart = this.timeToMinutes(slot.startTime);
    const existingEnd = this.timeToMinutes(slot.endTime);

    const overlaps =
      start < existingEnd && end > existingStart;

    if (overlaps) {
      throw new ConflictException(
        'Availability overlaps with another availability window.',
      );
    }
  }

  return this.prisma.recurringAvailability.create({
    data: {
      doctorId: doctor.id,
      day: dto.day,
      startTime: dto.startTime,
      endTime: dto.endTime,
    },
  });
}

async getAvailability(userId: string) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  return this.prisma.recurringAvailability.findMany({
    where: {
      doctorId: doctor.id,
    },
    orderBy: [
      {
        day: 'asc',
      },
      {
        startTime: 'asc',
      },
    ],
  });
}

async updateAvailability(
  userId: string,
  id: string,
  dto: UpdateAvailabilityDto,
) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  const availability = await this.prisma.recurringAvailability.findFirst({
    where: {
      id,
      doctorId: doctor.id,
    },
  });

  if (!availability) {
    throw new NotFoundException('Availability not found');
  }

  const start = this.timeToMinutes(dto.startTime ?? availability.startTime);
  const end = this.timeToMinutes(dto.endTime ?? availability.endTime);

  if (start >= end) {
    throw new BadRequestException(
      'Start time must be before end time',
    );
  }
   
const updatedDay = dto.day ?? availability.day;
const updatedStart = dto.startTime ?? availability.startTime;
const updatedEnd = dto.endTime ?? availability.endTime;

// Elastic Scheduling Validation
const appointmentDate = new Date();

const weekdayMap = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

while (
  weekdayMap[appointmentDate.getDay()] !== updatedDay
) {
  appointmentDate.setDate(appointmentDate.getDate() + 1);
}

const appointments =
  await this.prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      date: appointmentDate,
      status: 'BOOKED',
    },
  });

const newStart = this.timeToMinutes(updatedStart);
const newEnd = this.timeToMinutes(updatedEnd);

for (const appointment of appointments) {
  if (!appointment.startTime || !appointment.endTime) {
    continue;
  }

  const appointmentStart = this.timeToMinutes(
    appointment.startTime,
  );

  const appointmentEnd = this.timeToMinutes(
    appointment.endTime,
  );

  if (
    appointmentStart < newStart ||
    appointmentEnd > newEnd
  ) {
    throw new ConflictException(
      'Cannot shrink availability. Existing appointments would fall outside the updated availability window.',
    );
  }
}

const existingSlots =
  await this.prisma.recurringAvailability.findMany({
    where: {
      doctorId: doctor.id,
      day: updatedDay,
      NOT: {
        id,
      },
    },
  });

for (const slot of existingSlots) {
  const existingStart = this.timeToMinutes(slot.startTime);
  const existingEnd = this.timeToMinutes(slot.endTime);

  const overlaps =
    this.timeToMinutes(updatedStart) < existingEnd &&
    this.timeToMinutes(updatedEnd) > existingStart;

  if (overlaps) {
    throw new ConflictException(
      'Availability overlaps with existing slot',
    );
  }
}
  return this.prisma.recurringAvailability.update({
    where: { id },
    data: dto,
  });
}

async deleteAvailability(userId: string, id: string) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  const availability = await this.prisma.recurringAvailability.findFirst({
    where: {
      id,
      doctorId: doctor.id,
    },
  });

  if (!availability) {
    throw new NotFoundException('Availability not found');
  }

  await this.prisma.recurringAvailability.delete({
    where: { id },
  });

  return {
    message: 'Availability deleted successfully',
  };
}

async createAvailabilityOverride(
  userId: string,
  dto: CreateAvailabilityOverrideDto,
) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  const start = this.timeToMinutes(dto.startTime);
  const end = this.timeToMinutes(dto.endTime);

  if (start >= end) {
    throw new BadRequestException(
      'Start time must be before end time',
    );
  }

  const date = new Date(dto.date);

  const existing = await this.prisma.customAvailability.findMany({
    where: {
      doctorId: doctor.id,
      date,
    },
  });

  for (const slot of existing) {
    const existingStart = this.timeToMinutes(slot.startTime);
    const existingEnd = this.timeToMinutes(slot.endTime);

    const overlaps =
      start < existingEnd && end > existingStart;

    if (overlaps) {
      throw new ConflictException(
        'Availability overlaps with existing override',
      );
    }
  }

  return this.prisma.customAvailability.create({
    data: {
      doctorId: doctor.id,
      date,
      startTime: dto.startTime,
      endTime: dto.endTime,
    },
  });
}

async getAvailabilityByDate(userId: string, date: string) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  const selectedDate = new Date(date);

  if (isNaN(selectedDate.getTime())) {
    throw new BadRequestException('Invalid date');
  }

  // Get all active appointments for the selected date
  const bookedAppointments = await this.prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      date: selectedDate,
      status: 'BOOKED',
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });

  // Check custom override first
  const overrides = await this.prisma.customAvailability.findMany({
    where: {
      doctorId: doctor.id,
      date: selectedDate,
    },
    orderBy: {
      startTime: 'asc',
    },
  });

  if (overrides.length > 0) {
    const availability = overrides.map((slot) => ({
      ...slot,
      available: !bookedAppointments.some(
        (appointment) =>
          appointment.startTime === slot.startTime &&
          appointment.endTime === slot.endTime,
      ),
    }));

    return {
      source: 'CUSTOM_OVERRIDE',
      availability,
    };
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

  const day = weekdays[selectedDate.getDay()];

  const recurring = await this.prisma.recurringAvailability.findMany({
    where: {
      doctorId: doctor.id,
      day: day as any,
    },
    orderBy: {
      startTime: 'asc',
    },
  });

  const availability = recurring.map((slot) => ({
    ...slot,
    available: !bookedAppointments.some(
      (appointment) =>
        appointment.startTime === slot.startTime &&
        appointment.endTime === slot.endTime,
    ),
  }));

  return {
    source: 'RECURRING',
    availability,
  };
}

async updateScheduling(
  userId: string,
  dto: UpdateSchedulingDto,
) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  if (dto.schedulingType === 'STREAM') {
}

if (dto.schedulingType === 'WAVE') {
  if (!dto.waveDuration) {
    throw new BadRequestException(
      'Wave duration is required for WAVE scheduling',
    );
  }

  if (!dto.waveCapacity) {
    throw new BadRequestException(
      'Wave capacity is required for WAVE scheduling',
    );
  }
}

  return this.prisma.doctorProfile.update({
  where: {
    id: doctor.id,
  },
  data: {
    schedulingType: dto.schedulingType,
    bufferTime: dto.bufferTime ?? null,
    waveDuration: dto.waveDuration ?? null,
    waveCapacity: dto.waveCapacity ?? null,
  },
});
}

async generateStreamSlots(userId: string, date: string) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  if (doctor.schedulingType !== 'STREAM') {
    throw new BadRequestException(
      'Doctor is not using STREAM scheduling',
    );
  }

  const availabilityResponse =
    await this.getAvailabilityByDate(userId, date);

  return {
    schedulingType: 'STREAM',
    date,
    availability: availabilityResponse.availability,
  };
}

async generateWaveAvailability(userId: string, date: string) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  if (doctor.schedulingType !== 'WAVE') {
    throw new BadRequestException(
      'Doctor is not using WAVE scheduling',
    );
  }

  if (!doctor.waveDuration || !doctor.waveCapacity) {
    throw new BadRequestException(
      'Wave scheduling is not fully configured',
    );
  }

  const availabilityResponse =
    await this.getAvailabilityByDate(userId, date);

  const waves: {
    startTime: string;
    endTime: string;
    capacity: number;
    available: number;
  }[] = [];

  for (const availability of availabilityResponse.availability) {
    let current = this.timeToMinutes(availability.startTime);
    const end = this.timeToMinutes(availability.endTime);

    while (current + doctor.waveDuration <= end) {
      waves.push({
        startTime: this.minutesToTime(current),
        endTime: this.minutesToTime(
          current + doctor.waveDuration,
        ),
        capacity: doctor.waveCapacity,
        available: doctor.waveCapacity,
      });

      current += doctor.waveDuration;
    }
  }

  return {
    schedulingType: 'WAVE',
    date,
    waves,
  };
}

async getAppointments(userId: string) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor profile not found');
  }

  const appointments = await this.prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
    },
    include: {
      patient: true,
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

}

