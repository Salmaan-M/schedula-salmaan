import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Get } from '@nestjs/common';
import { Patch, Param } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PATIENT')
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
  ) {}

  @Post('book')
  book(
    @Req() req: AuthenticatedRequest,
    @Body() dto: BookAppointmentDto,
  ) {
    return this.appointmentService.bookAppointment(
      req.user.id,
      dto,
    );
  }
  @Get('my')
getMyAppointments(@Req() req: AuthenticatedRequest) {
  return this.appointmentService.getMyAppointments(
    req.user.id,
  );
}

@Patch(':id/cancel')
cancelAppointment(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
) {
  return this.appointmentService.cancelAppointment(
    req.user.id,
    id,
  );
}

@Patch(':id/reschedule')
rescheduleAppointment(
  @Req() req: AuthenticatedRequest,
  @Param('id') id: string,
  @Body() dto: RescheduleAppointmentDto,
) {
  return this.appointmentService.rescheduleAppointment(
    req.user.id,
    id,
    dto,
  );
}

}