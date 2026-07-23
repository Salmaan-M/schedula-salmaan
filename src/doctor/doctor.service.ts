import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

@Injectable()
export class DoctorService {
  constructor(private prisma: PrismaService) {}

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
}

