import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SlotGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}`;
  }
  generateSlots(
  startTime: string,
  endTime: string,
  slotDuration: number,
  buffer: number,
) {
  const slots: {
    startTime: string;
    endTime: string;
  }[] = [];

  let current = this.timeToMinutes(startTime);
  const end = this.timeToMinutes(endTime);

  while (current + slotDuration <= end) {
    slots.push({
      startTime: this.minutesToTime(current),
      endTime: this.minutesToTime(current + slotDuration),
    });

    current += slotDuration + buffer;
  }

  return slots;
}

applyBuffer(
  startTime: string,
  endTime: string,
  slotDuration: number,
  buffer: number,
) {
  return this.generateSlots(startTime, endTime, slotDuration, buffer);
}

markBookedSlots(
  generatedSlots: {
    startTime: string;
    endTime: string;
  }[],
  bookedAppointments: {
    startTime: string | null;
    endTime: string | null;
  }[],
) {
  return generatedSlots.map((slot) => ({
    ...slot,
    available: !bookedAppointments.some(
      (appointment) =>
        appointment.startTime === slot.startTime &&
        appointment.endTime === slot.endTime,
    ),
  }));
}

isSlotAvailable(
  slots: {
    startTime: string;
    endTime: string;
    available?: boolean;
  }[],
  startTime: string,
  endTime: string,
) {
  return slots.some(
    (slot) =>
      slot.startTime === startTime &&
      slot.endTime === endTime &&
      slot.available === true,
  );
}

async getGeneratedSlots(
  doctor: { id: string; bufferTime?: number | null },
  availability: Array<{ startTime: string; endTime: string }>,
  date: Date,
) {
  const slotDuration = 15;
  const generatedSlots: { startTime: string; endTime: string }[] = [];

  for (const slot of availability) {
    generatedSlots.push(
      ...this.generateSlots(
        slot.startTime,
        slot.endTime,
        slotDuration,
        doctor.bufferTime ?? 0,
      ),
    );
  }

  // Normalize date to midnight (date-only)
  const normalizedDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  // Persist generated slots; skip duplicates if run multiple times
  const createData = generatedSlots.map((s) => ({
    doctorId: doctor.id,
    date: normalizedDate,
    startTime: s.startTime,
    endTime: s.endTime,
  }));

  if (createData.length > 0) {
    await this.prisma.slot.createMany({ data: createData, skipDuplicates: true });
  }

  // Read persisted slots (status reflects booked/available)
  const persisted = await this.prisma.slot.findMany({
    where: {
      doctorId: doctor.id,
      date: normalizedDate,
    },
    select: {
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  return generatedSlots.map((gs) => ({
    ...gs,
    available:
      persisted.find(
        (p) => p.startTime === gs.startTime && p.endTime === gs.endTime,
      )?.status === 'AVAILABLE',
  }));
}
}