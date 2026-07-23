import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { DoctorService } from './doctor.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

@Controller('doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DOCTOR')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Post('profile')
  createProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDoctorProfileDto,
  ) {
    console.log(req.user); // Remove after testing
    return this.doctorService.createProfile(req.user.id, dto);
  }

  @Get('profile')
getProfile(@Req() req: AuthenticatedRequest) {
  return this.doctorService.getProfile(req.user.id);
}

@Patch('profile')
updateProfile(
  @Req() req: AuthenticatedRequest,
  @Body() dto: UpdateDoctorProfileDto,
) {
  return this.doctorService.updateProfile(req.user.id, dto);
}
}