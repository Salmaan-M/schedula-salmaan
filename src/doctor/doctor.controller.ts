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
import { Delete } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { Param } from '@nestjs/common';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateAvailabilityOverrideDto } from './dto/create-availability-override.dto';
import { UpdateSchedulingDto } from './dto/update-scheduling.dto';

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

@Post('availability')
createAvailability(
  @Req() req: AuthenticatedRequest,
  @Body() dto: CreateAvailabilityDto,
) {
  return this.doctorService.createAvailability(req.user.id, dto);
}

@Get('availability')
getAvailability(@Req() req: AuthenticatedRequest) {
  return this.doctorService.getAvailability(req.user.id);
}

@Patch('availability/:id')
updateAvailability(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
  @Body() dto: UpdateAvailabilityDto,
) {
  return this.doctorService.updateAvailability(
    req.user.id,
    id,
    dto,
  );
}

@Delete('availability/:id')
deleteAvailability(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
) {
  return this.doctorService.deleteAvailability(
    req.user.id,
    id,
  );
}

@Post('availability/override')
createAvailabilityOverride(
  @Req() req: AuthenticatedRequest,
  @Body() dto: CreateAvailabilityOverrideDto,
) {
  return this.doctorService.createAvailabilityOverride(
    req.user.id,
    dto,
  );
}

@Get('availability/date')
getAvailabilityByDate(
  @Req() req: AuthenticatedRequest,
  @Query('date') date: string,
) {
  return this.doctorService.getAvailabilityByDate(
    req.user.id,
    date,
  );
}

@Patch('scheduling')
updateScheduling(
  @Req() req: AuthenticatedRequest,
  @Body() dto: UpdateSchedulingDto,
) {
  return this.doctorService.updateScheduling(
    req.user.id,
    dto,
  );
}

@Get('availability/slots')
generateStreamSlots(
  @Req() req: AuthenticatedRequest,
  @Query('date') date: string,
) {
  return this.doctorService.generateStreamSlots(
    req.user.id,
    date,
  );
}

@Get('availability/waves')
generateWaveAvailability(
  @Req() req: AuthenticatedRequest,
  @Query('date') date: string,
) {
  return this.doctorService.generateWaveAvailability(
    req.user.id,
    date,
  );
}

}