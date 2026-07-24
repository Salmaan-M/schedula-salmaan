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

@Injectable()
export class DoctorService {
  constructor(private prisma: PrismaService) {}

   private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
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
        'Availability overlaps with existing slot',
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
    return {
      source: 'CUSTOM_OVERRIDE',
      availability: overrides,
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

  return {
    source: 'RECURRING',
    availability: recurring,
  };
}

}

