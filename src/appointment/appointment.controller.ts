import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BookAppointmentDto } from './dto/book-appointment.dto';

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
}