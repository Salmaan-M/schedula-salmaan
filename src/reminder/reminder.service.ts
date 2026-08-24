import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { DoctorService } from '../doctor/doctor.service';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly doctorService: DoctorService,
  ) {}

  // Run every minute
  @Cron('*/1 * * * *')
  async handleReminders() {
     this.logger.log(
    `Reminder cron running at ${new Date().toISOString()}`,
  );
    const windowMinutes = parseInt(process.env.APPOINTMENT_REMINDER_MINUTES ?? '60', 10);
    const now = new Date();
    const upper = new Date(now.getTime() + windowMinutes * 60 * 1000);

    try {
      // Fetch candidate appointments with status BOOKED and date <= upper
      const candidates = await this.prisma.appointment.findMany({
        where: {
          status: 'BOOKED',
          date: {
            lte: upper,
          },
        },
        include: { doctor: true },
      });

      for (const appt of candidates) {
        try {
          // Skip if appointment date/time already past
          if (!appt) continue;

          const doctor = appt.doctor;
          if (!doctor) continue;

          if (doctor.schedulingType === 'STREAM') {
            if (!appt.startTime) continue;

            const apptDate = new Date(appt.date);
            const [h, m] = appt.startTime.split(':').map(Number);
            apptDate.setHours(h, m, 0, 0);

            const diffMinutes = (apptDate.getTime() - now.getTime()) / (60 * 1000);

            if (diffMinutes >= 0 && diffMinutes <= windowMinutes) {
              const title = 'Appointment Reminder';
              const message = `Reminder: You have an appointment with Dr. ${doctor.fullName} on ${apptDate.toDateString()} at ${appt.startTime}.`;

              await this.safeCreateReminder(appt.patientId, appt.id, title, message);
            }
          } else {
            // WAVE scheduling: compute reporting time using doctor service's existing logic
            if (!appt.tokenNumber) continue;

            // fetch doctor's userId to call doctorService.generateWaveAvailability
            const doctorProfile = await this.prisma.doctorProfile.findUnique({
              where: { id: doctor.id },
            });

            if (!doctorProfile) continue;

            // Use the doctor's userId (relation) to call the existing method
            const userId = doctorProfile.userId;

            const wavesResp = await this.doctorService.generateWaveAvailability(userId, appt.date.toISOString());

            const waves = (wavesResp as any).waves as Array<any>;
            if (!waves || waves.length === 0) continue;

            const token = appt.tokenNumber;

            // Determine which wave contains the token by capacity
            let cumulative = 0;
            let reportingTime: string | undefined;

            for (const w of waves) {
              const cap = w.capacity ?? 0;
              cumulative += cap;
              if (token <= cumulative) {
                reportingTime = w.startTime;
                break;
              }
            }

            if (!reportingTime) continue;

            const reportingDate = new Date(appt.date);
            const [rh, rm] = reportingTime.split(':').map(Number);
            reportingDate.setHours(rh, rm, 0, 0);

            const diffMinutes = (reportingDate.getTime() - now.getTime()) / (60 * 1000);

            if (diffMinutes >= 0 && diffMinutes <= windowMinutes) {
              const title = 'Appointment Reminder';
              const message = `Reminder: You have an appointment with Dr. ${doctor.fullName}. Reporting Time: ${reportingTime}. Token Number: ${appt.tokenNumber}`;

              await this.safeCreateReminder(appt.patientId, appt.id, title, message);
            }
          }
        } catch (err) {
          this.logger.error('Error processing appointment reminder', err as any);
          // Continue processing other appointments
        }
      }
    } catch (err) {
      this.logger.error('Reminder job failed', err as any);
    }
  }

  private async safeCreateReminder(patientId: string, appointmentId: string, title: string, message: string) {
    try {
      await this.notificationService.createNotification({
        patientId,
        appointmentId,
        type: 'APPOINTMENT_REMINDER' as any,
        title,
        message,
      });
    } catch (err) {
      // NotificationService handles P2002; log and continue
      this.logger.warn('Failed to create reminder notification', err as any);
    }
  }
}
