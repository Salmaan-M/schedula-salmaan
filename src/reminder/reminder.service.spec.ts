import { Test, TestingModule } from '@nestjs/testing';
import { ReminderService } from './reminder.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { DoctorService } from '../doctor/doctor.service';

describe('ReminderService', () => {
  let service: ReminderService;
  let prisma: Partial<PrismaService>;
  let notification: Partial<NotificationService>;
  let doctorService: Partial<DoctorService>;

  beforeEach(async () => {
    prisma = {
      appointment: { findMany: jest.fn() } as any,
      doctorProfile: { findUnique: jest.fn() } as any,
    } as Partial<PrismaService>;

    notification = {
      createNotification: jest.fn(),
      getNotificationsForPatient: jest.fn(),
      markAsRead: jest.fn(),
    } as Partial<NotificationService>;

    doctorService = {
      generateWaveAvailability: jest.fn(),
    } as Partial<DoctorService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notification },
        { provide: DoctorService, useValue: doctorService },
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
