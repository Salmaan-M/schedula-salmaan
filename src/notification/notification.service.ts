import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type NotificationCreateInput = {
  patientId: string;
  appointmentId: string;
  type: 'APPOINTMENT_BOOKED' | 'APPOINTMENT_CANCELLED' | 'APPOINTMENT_RESCHEDULED' | 'APPOINTMENT_REMINDER';
  title: string;
  message: string;
};

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(
    data: NotificationCreateInput,
    tx?: any,
  ) {
    const client = tx ?? this.prisma;

    try {
      return await client.notification.create({ data });
    } catch (err: any) {
      // Handle unique constraint (duplicate notification) gracefully
      if (err?.code === 'P2002') {
        return client.notification.findFirst({
          where: { appointmentId: data.appointmentId, type: data.type },
        });
      }

      throw err;
    }
  }

  async getNotificationsForPatient(userId: string) {
    const patient = await this.prisma.patientProfile.findUnique({
      where: { userId },
    });

    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }

    return this.prisma.notification.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markAsRead(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }
}
