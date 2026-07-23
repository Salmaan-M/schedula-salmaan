import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientProfileDto } from './dto/create-patient-profile.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

@Injectable()
export class PatientService {
  constructor(private prisma: PrismaService) {}

  async createProfile(userId: string, dto: CreatePatientProfileDto) {
    const existing = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException('Patient profile already exists');
    }

    return this.prisma.patientProfile.create({
      data: {
        ...dto,
        userId,
      },
    });
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }

    return profile;
  }

  async updateProfile(userId: string, dto: UpdatePatientProfileDto) {
    const profile = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found');
    }

    return this.prisma.patientProfile.update({
      where: { userId },
      data: dto,
    });
  }
}