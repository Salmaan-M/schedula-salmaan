import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { CreateAvailabilityOverrideDto } from './dto/create-availability-override.dto';
import { UpdateSchedulingDto } from './dto/update-scheduling.dto';
import { SlotGeneratorService } from '../scheduling/slot-generator.service';

@Injectable()
export class DoctorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slotGenerator: SlotGeneratorService,
  ) {}

  private readonly weekdayMap = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ];

  private readonly SLOT_DURATION = 15;
  private readonly EXPAND_GENERATION_DAYS = 90;
  private readonly RELOCATION_SEARCH_DAYS = 365;

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

  private normalizeDate(date: Date): Date {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
  }

  private getWeekday(date: Date): string {
    return this.weekdayMap[date.getDay()];
  }

  // ============================================================
  // DOCTOR PROFILE
  // ============================================================

  async createProfile(
    userId: string,
    dto: CreateDoctorProfileDto,
  ) {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new ConflictException(
        'Doctor profile already exists',
      );
    }

    return this.prisma.doctorProfile.create({
      data: {
        ...dto,
        userId,
      },
    });
  }

  async getProfile(userId: string) {
    const profile =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!profile) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    return profile;
  }

  async updateProfile(
    userId: string,
    dto: UpdateDoctorProfileDto,
  ) {
    const profile =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!profile) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    return this.prisma.doctorProfile.update({
      where: { userId },
      data: dto,
    });
  }

  // ============================================================
  // AVAILABILITY
  // ============================================================

  async createAvailability(
    userId: string,
    dto: CreateAvailabilityDto,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    const start = this.timeToMinutes(dto.startTime);
    const end = this.timeToMinutes(dto.endTime);

    if (start >= end) {
      throw new BadRequestException(
        'Start time must be before end time',
      );
    }

    const existing =
      await this.prisma.recurringAvailability.findMany({
        where: {
          doctorId: doctor.id,
          day: dto.day,
        },
      });

    for (const availability of existing) {
      const existingStart = this.timeToMinutes(
        availability.startTime,
      );

      const existingEnd = this.timeToMinutes(
        availability.endTime,
      );

      const overlaps =
        start < existingEnd &&
        end > existingStart;

      if (overlaps) {
        throw new ConflictException(
          'Availability overlaps with another availability window.',
        );
      }
    }

    return this.prisma.recurringAvailability.create({
      data: {
        doctorId: doctor.id,
        day: dto.day,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  async getAvailability(userId: string) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    return this.prisma.recurringAvailability.findMany({
      where: {
        doctorId: doctor.id,
      },
      orderBy: [
        {
          day: 'asc',
        },
        {
          startTime: 'asc',
        },
      ],
    });
  }

  // ============================================================
  // INTERNAL AVAILABILITY HELPERS
  // ============================================================

  /**
   * Returns availability for a doctor on a particular date.
   *
   * Custom availability takes precedence over recurring
   * availability.
   */
  private async getAvailabilityForDoctorDate(
    doctorId: string,
    date: Date,
  ) {
    const normalizedDate = this.normalizeDate(date);

    const overrides =
      await this.prisma.customAvailability.findMany({
        where: {
          doctorId,
          date: normalizedDate,
        },
        orderBy: {
          startTime: 'asc',
        },
      });

    if (overrides.length > 0) {
      return overrides;
    }

    const weekday = this.getWeekday(normalizedDate);

    return this.prisma.recurringAvailability.findMany({
      where: {
        doctorId,
        day: weekday as any,
      },
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  /**
   * Returns BOOKED appointments belonging to the original
   * availability window.
   *
   * These are the appointments that need to be checked when
   * a doctor changes/shrinks that availability.
   */
  private async getBookedAppointmentsForWindow(
    doctorId: string,
    day: string,
    startTime: string,
    endTime: string,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const appointments =
      await this.prisma.appointment.findMany({
        where: {
          doctorId,
          status: 'BOOKED',
          date: {
            gte: today,
          },
        },
        select: {
          id: true,
          date: true,
          startTime: true,
          endTime: true,
        },
        orderBy: [
          {
            date: 'asc',
          },
          {
            startTime: 'asc',
          },
        ],
      });

    const windowStart =
      this.timeToMinutes(startTime);

    const windowEnd =
      this.timeToMinutes(endTime);

    return appointments.filter((appointment) => {
      if (
        !appointment.startTime ||
        !appointment.endTime
      ) {
        return false;
      }

      const appointmentDay =
        this.getWeekday(appointment.date);

      if (appointmentDay !== day) {
        return false;
      }

      const appointmentStart =
        this.timeToMinutes(
          appointment.startTime,
        );

      const appointmentEnd =
        this.timeToMinutes(
          appointment.endTime,
        );

      return (
        appointmentStart >= windowStart &&
        appointmentEnd <= windowEnd
      );
    });
  }

  // ============================================================
  // ELASTIC AVAILABILITY UPDATE
  // ============================================================

  async updateAvailability(
    userId: string,
    id: string,
    dto: UpdateAvailabilityDto,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    const availability =
      await this.prisma.recurringAvailability.findFirst({
        where: {
          id,
          doctorId: doctor.id,
        },
      });

    if (!availability) {
      throw new NotFoundException(
        'Availability not found',
      );
    }

    const updatedDay =
      dto.day ?? availability.day;

    const updatedStart =
      dto.startTime ?? availability.startTime;

    const updatedEnd =
      dto.endTime ?? availability.endTime;

    const newStart =
      this.timeToMinutes(updatedStart);

    const newEnd =
      this.timeToMinutes(updatedEnd);

    if (newStart >= newEnd) {
      throw new BadRequestException(
        'Start time must be before end time',
      );
    }

    // ----------------------------------------------------------
    // Validate overlap with other availability windows
    // ----------------------------------------------------------

    const otherAvailabilities =
      await this.prisma.recurringAvailability.findMany({
        where: {
          doctorId: doctor.id,
          day: updatedDay as any,
          NOT: {
            id,
          },
        },
      });

    for (const existing of otherAvailabilities) {
      const existingStart =
        this.timeToMinutes(
          existing.startTime,
        );

      const existingEnd =
        this.timeToMinutes(
          existing.endTime,
        );

      const overlaps =
        newStart < existingEnd &&
        newEnd > existingStart;

      if (overlaps) {
        throw new ConflictException(
          'Availability overlaps with existing availability window.',
        );
      }
    }

    // ----------------------------------------------------------
    // Determine whether this is an expand operation
    // ----------------------------------------------------------

    const expanded =
      newStart <
        this.timeToMinutes(
          availability.startTime,
        ) ||
      newEnd >
        this.timeToMinutes(
          availability.endTime,
        );

    // ----------------------------------------------------------
    // Find appointments affected by the change
    // ----------------------------------------------------------

    const bookedAppointments =
      await this.getBookedAppointmentsForWindow(
        doctor.id,
        availability.day,
        availability.startTime,
        availability.endTime,
      );

    const conflictingAppointments: Array<{
      appointmentId: string;
      startTime: string;
      endTime: string;
      date: Date;
    }> = [];

    for (const appointment of bookedAppointments) {
      if (
        !appointment.startTime ||
        !appointment.endTime
      ) {
        continue;
      }

      const appointmentStart =
        this.timeToMinutes(
          appointment.startTime,
        );

      const appointmentEnd =
        this.timeToMinutes(
          appointment.endTime,
        );

      const isOutsideWindow =
        appointmentStart < newStart ||
        appointmentEnd > newEnd;

      const isDifferentDay =
        this.getWeekday(appointment.date) !==
        updatedDay;

      if (
        isOutsideWindow ||
        isDifferentDay
      ) {
        conflictingAppointments.push({
          appointmentId: appointment.id,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          date: appointment.date,
        });
      }
    }

    conflictingAppointments.sort((a, b) => {
      const dateDifference =
        a.date.getTime() -
        b.date.getTime();

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return a.startTime.localeCompare(
        b.startTime,
      );
    });

    // ==========================================================
    // SIMPLE UPDATE / EXPAND
    // ==========================================================

    if (conflictingAppointments.length === 0) {
      return this.prisma.$transaction(
        async (tx) => {
          // First update availability.
          const updated =
            await tx.recurringAvailability.update({
              where: { id },
              data: dto,
            });

          // ----------------------------------------------------
          // EXPAND
          // ----------------------------------------------------

          if (
            expanded &&
            doctor.schedulingType === 'STREAM'
          ) {
            const today = new Date();

            for (
              let i = 0;
              i < this.EXPAND_GENERATION_DAYS;
              i++
            ) {
              const date = new Date(today);

              date.setDate(
                today.getDate() + i,
              );

              const normalizedDate =
                this.normalizeDate(date);

              const weekday =
                this.getWeekday(
                  normalizedDate,
                );

              // Only generate slots for the
              // affected recurring weekday.
              if (
                weekday !== updatedDay
              ) {
                continue;
              }

              const slots =
                this.slotGenerator.generateSlots(
                  updatedStart,
                  updatedEnd,
                  this.SLOT_DURATION,
                  doctor.bufferTime ?? 0,
                );

              const createData =
                slots.map((slot) => ({
                  doctorId: doctor.id,
                  date: normalizedDate,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                }));

              if (createData.length > 0) {
                await tx.slot.createMany({
                  data: createData,
                  skipDuplicates: true,
                });
              }
            }
          }

          return updated;
        },
      );
    }

    // ==========================================================
    // ELASTIC SHRINK
    //
    // Existing appointments are moved to the next available
    // valid slot instead of rejecting the doctor's change.
    // ==========================================================

    if (
      doctor.schedulingType !== 'STREAM'
    ) {
      throw new ConflictException(
        'Affected appointments cannot be automatically relocated for WAVE scheduling.',
      );
    }

    // ----------------------------------------------------------
    // Find a destination slot for every affected appointment.
    //
    // This happens BEFORE modifying the availability so that
    // we know whether the shrink is possible.
    // ----------------------------------------------------------

    const chosenSlotIds =
      new Set<string>();

    const appointmentToCandidate =
      new Map<
        string,
        {
          slotId: string;
          date: Date;
          startTime: string;
          endTime: string;
        }
      >();

    for (
      const conflict of conflictingAppointments
    ) {
      let found = false;

      const originalDate =
        this.normalizeDate(
          conflict.date,
        );

      // Search from the day after the appointment.
      //
      // We intentionally move an affected appointment
      // forward rather than putting it back into the
      // availability window that caused the conflict.
      for (
        let dayOffset = 1;
        dayOffset <=
          this.RELOCATION_SEARCH_DAYS &&
        !found;
        dayOffset++
      ) {
        const candidateDate =
          new Date(originalDate);

        candidateDate.setDate(
          originalDate.getDate() +
            dayOffset,
        );

        const normalizedDate =
          this.normalizeDate(
            candidateDate,
          );

        const weekday =
          this.getWeekday(
            normalizedDate,
          );

        const availabilities =
          await this.getAvailabilityForDoctorDate(
            doctor.id,
            normalizedDate,
          );

        if (
          !availabilities ||
          availabilities.length === 0
        ) {
          continue;
        }

        for (
          const candidateAvailability of
            availabilities
        ) {
          let generatedSlots =
            this.slotGenerator.generateSlots(
              candidateAvailability.startTime,
              candidateAvailability.endTime,
              this.SLOT_DURATION,
              doctor.bufferTime ?? 0,
            );

          for (
            const generatedSlot of generatedSlots
          ) {
            // Check whether this slot is already
            // persisted.
            const existingSlot =
              await this.prisma.slot.findUnique({
                where: {
                  doctorId_date_startTime_endTime:
                    {
                      doctorId:
                        doctor.id,
                      date:
                        normalizedDate,
                      startTime:
                        generatedSlot.startTime,
                      endTime:
                        generatedSlot.endTime,
                    },
                },
              });

            // If persisted and already booked,
            // it cannot be used.
            if (
              existingSlot &&
              existingSlot.status ===
                'BOOKED'
            ) {
              continue;
            }

            // If another affected appointment
            // already selected this slot, skip it.
            if (
              existingSlot &&
              chosenSlotIds.has(
                existingSlot.id,
              )
            ) {
              continue;
            }

            const slotId =
              existingSlot?.id ??
              `new:${doctor.id}:${normalizedDate.toISOString()}:${generatedSlot.startTime}:${generatedSlot.endTime}`;

            if (
              chosenSlotIds.has(slotId)
            ) {
              continue;
            }

            appointmentToCandidate.set(
              conflict.appointmentId,
              {
                slotId,
                date: normalizedDate,
                startTime:
                  generatedSlot.startTime,
                endTime:
                  generatedSlot.endTime,
              },
            );

            chosenSlotIds.add(slotId);

            found = true;
            break;
          }

          if (found) {
            break;
          }
        }

        // Keep weekday variable intentionally evaluated
        // for clarity of the scheduling search.
        void weekday;
      }

      if (!found) {
        throw new ConflictException({
          message:
            'No future slot available to relocate appointment',
          appointmentId:
            conflict.appointmentId,
        });
      }
    }

    // ==========================================================
    // ATOMIC SHRINK TRANSACTION
    // ==========================================================

    return this.prisma.$transaction(
      async (tx) => {
        // ------------------------------------------------------
        // 1. Update doctor's availability
        // ------------------------------------------------------

        await tx.recurringAvailability.update({
          where: { id },
          data: dto,
        });

        // ------------------------------------------------------
        // 2. Relocate every affected appointment
        // ------------------------------------------------------

        for (
          const conflict of
            conflictingAppointments
        ) {
          const candidate =
            appointmentToCandidate.get(
              conflict.appointmentId,
            );

          if (!candidate) {
            throw new ConflictException(
              'Candidate slot missing during relocation',
            );
          }

          const appointment =
            await tx.appointment.findUnique({
              where: {
                id: conflict.appointmentId,
              },
            });

          if (!appointment) {
            throw new ConflictException(
              'Affected appointment not found during relocation',
            );
          }

          let newSlotId =
            candidate.slotId;

          // ----------------------------------------------------
          // Create destination slot if it does not exist.
          // ----------------------------------------------------

          if (
            newSlotId.startsWith('new:')
          ) {
            const created =
              await tx.slot.create({
                data: {
                  doctorId: doctor.id,
                  date: candidate.date,
                  startTime:
                    candidate.startTime,
                  endTime:
                    candidate.endTime,
                  status: 'AVAILABLE',
                },
              });

            newSlotId = created.id;
          }

          // ----------------------------------------------------
          // Claim destination slot atomically.
          // ----------------------------------------------------

// ----------------------------------------------------
// Release old slot FIRST.
// ----------------------------------------------------
// appointmentId is UNIQUE on Slot, so the old slot must
// release the appointment before the new slot can claim it.

await tx.slot.updateMany({
  where: {
    appointmentId: appointment.id,
  },
  data: {
    status: 'AVAILABLE',
    appointmentId: null,
  },
});

// ----------------------------------------------------
// Claim destination slot.
// ----------------------------------------------------

const claimed = await tx.slot.updateMany({
  where: {
    id: newSlotId,
    status: 'AVAILABLE',
    appointmentId: null,
  },
  data: {
    status: 'BOOKED',
    appointmentId: appointment.id,
  },
});

if (claimed.count === 0) {
  throw new ConflictException(
    'Destination slot became unavailable during relocation',
  );
}

          // ----------------------------------------------------
          // Update appointment.
          // ----------------------------------------------------

          await tx.appointment.update({
            where: {
              id: appointment.id,
            },
            data: {
              date: candidate.date,
              startTime:
                candidate.startTime,
              endTime:
                candidate.endTime,
            },
          });
        }

        return {
          message:
            'Availability updated and affected appointments relocated successfully',
          relocatedAppointments:
            conflictingAppointments.map(
              (appointment) => ({
                appointmentId:
                  appointment.appointmentId,
                from: {
                  date: appointment.date,
                  startTime:
                    appointment.startTime,
                  endTime:
                    appointment.endTime,
                },
                to:
                  appointmentToCandidate.get(
                    appointment.appointmentId,
                  ),
              }),
            ),
        };
      },
    );
  }

  // ============================================================
  // DELETE AVAILABILITY
  // ============================================================

  async deleteAvailability(
    userId: string,
    id: string,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    const availability =
      await this.prisma.recurringAvailability.findFirst({
        where: {
          id,
          doctorId: doctor.id,
        },
      });

    if (!availability) {
      throw new NotFoundException(
        'Availability not found',
      );
    }

    await this.prisma.recurringAvailability.delete({
      where: { id },
    });

    return {
      message:
        'Availability deleted successfully',
    };
  }

  // ============================================================
  // CUSTOM AVAILABILITY OVERRIDE
  // ============================================================

  async createAvailabilityOverride(
    userId: string,
    dto: CreateAvailabilityOverrideDto,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    const start =
      this.timeToMinutes(
        dto.startTime,
      );

    const end =
      this.timeToMinutes(
        dto.endTime,
      );

    if (start >= end) {
      throw new BadRequestException(
        'Start time must be before end time',
      );
    }

    const date = this.normalizeDate(
      new Date(dto.date),
    );

    if (isNaN(date.getTime())) {
      throw new BadRequestException(
        'Invalid date',
      );
    }

    const existing =
      await this.prisma.customAvailability.findMany({
        where: {
          doctorId: doctor.id,
          date,
        },
      });

    for (const slot of existing) {
      const existingStart =
        this.timeToMinutes(
          slot.startTime,
        );

      const existingEnd =
        this.timeToMinutes(
          slot.endTime,
        );

      const overlaps =
        start < existingEnd &&
        end > existingStart;

      if (overlaps) {
        throw new ConflictException(
          'Availability overlaps with existing override',
        );
      }
    }

    return this.prisma.customAvailability.create({
      data: {
        doctorId: doctor.id,
        date,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  // ============================================================
  // AVAILABILITY BY DATE
  // ============================================================

  async getAvailabilityByDate(
    userId: string,
    date: string,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    const selectedDate =
      new Date(date);

    if (
      isNaN(
        selectedDate.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid date',
      );
    }

    const normalizedDate =
      this.normalizeDate(
        selectedDate,
      );

    const bookedAppointments =
      await this.prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
          date: normalizedDate,
          status: 'BOOKED',
        },
        select: {
          startTime: true,
          endTime: true,
        },
      });

    const overrides =
      await this.prisma.customAvailability.findMany({
        where: {
          doctorId: doctor.id,
          date: normalizedDate,
        },
        orderBy: {
          startTime: 'asc',
        },
      });

    if (overrides.length > 0) {
      const availability =
        overrides.map((slot) => ({
          ...slot,
          available:
            !bookedAppointments.some(
              (appointment) =>
                appointment.startTime ===
                  slot.startTime &&
                appointment.endTime ===
                  slot.endTime,
            ),
        }));

      return {
        source:
          'CUSTOM_OVERRIDE',
        availability,
      };
    }

    const day =
      this.getWeekday(
        normalizedDate,
      );

    const recurring =
      await this.prisma.recurringAvailability.findMany({
        where: {
          doctorId: doctor.id,
          day: day as any,
        },
        orderBy: {
          startTime: 'asc',
        },
      });

    const availability =
      recurring.map((slot) => ({
        ...slot,
        available:
          !bookedAppointments.some(
            (appointment) =>
              appointment.startTime ===
                slot.startTime &&
              appointment.endTime ===
                slot.endTime,
          ),
      }));

    return {
      source: 'RECURRING',
      availability,
    };
  }

  // ============================================================
  // SCHEDULING CONFIGURATION
  // ============================================================

  async updateScheduling(
    userId: string,
    dto: UpdateSchedulingDto,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    if (
      dto.schedulingType ===
      'WAVE'
    ) {
      if (!dto.waveDuration) {
        throw new BadRequestException(
          'Wave duration is required for WAVE scheduling',
        );
      }

      if (!dto.waveCapacity) {
        throw new BadRequestException(
          'Wave capacity is required for WAVE scheduling',
        );
      }
    }

    return this.prisma.doctorProfile.update({
      where: {
        id: doctor.id,
      },
      data: {
        schedulingType:
          dto.schedulingType,
        bufferTime:
          dto.bufferTime ?? null,
        waveDuration:
          dto.waveDuration ?? null,
        waveCapacity:
          dto.waveCapacity ?? null,
      },
    });
  }

  // ============================================================
  // STREAM SLOT GENERATION
  // ============================================================

  async generateStreamSlots(
    userId: string,
    date: string,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    if (
      doctor.schedulingType !==
      'STREAM'
    ) {
      throw new BadRequestException(
        'Doctor is not using STREAM scheduling',
      );
    }

    const availabilityResponse =
      await this.getAvailabilityByDate(
        userId,
        date,
      );

    const selectedDate =
      this.normalizeDate(
        new Date(date),
      );

    const finalSlots =
      await this.slotGenerator.getGeneratedSlots(
        doctor,
        availabilityResponse.availability,
        selectedDate,
      );

    return {
      schedulingType:
        'STREAM',
      date,
      slots: finalSlots,
    };
  }

  // ============================================================
  // WAVE AVAILABILITY
  // ============================================================

  async generateWaveAvailability(
    userId: string,
    date: string,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    if (
      doctor.schedulingType !==
      'WAVE'
    ) {
      throw new BadRequestException(
        'Doctor is not using WAVE scheduling',
      );
    }

    if (
      !doctor.waveDuration ||
      !doctor.waveCapacity
    ) {
      throw new BadRequestException(
        'Wave scheduling is not fully configured',
      );
    }

    const availabilityResponse =
      await this.getAvailabilityByDate(
        userId,
        date,
      );

    const waves: Array<{
      startTime: string;
      endTime: string;
      capacity: number;
      available: number;
    }> = [];

    for (
      const availability of
        availabilityResponse.availability
    ) {
      let current =
        this.timeToMinutes(
          availability.startTime,
        );

      const end =
        this.timeToMinutes(
          availability.endTime,
        );

      while (
        current +
          doctor.waveDuration <=
        end
      ) {
        waves.push({
          startTime:
            this.minutesToTime(
              current,
            ),
          endTime:
            this.minutesToTime(
              current +
                doctor.waveDuration,
            ),
          capacity:
            doctor.waveCapacity,
          available:
            doctor.waveCapacity,
        });

        current +=
          doctor.waveDuration;
      }
    }

    return {
      schedulingType:
        'WAVE',
      date,
      waves,
    };
  }

  // ============================================================
  // DOCTOR APPOINTMENTS
  // ============================================================

  async getAppointments(
    userId: string,
  ) {
    const doctor =
      await this.prisma.doctorProfile.findUnique({
        where: { userId },
      });

    if (!doctor) {
      throw new NotFoundException(
        'Doctor profile not found',
      );
    }

    const appointments =
      await this.prisma.appointment.findMany({
        where: {
          doctorId: doctor.id,
        },
        include: {
          patient: true,
        },
        orderBy: {
          date: 'asc',
        },
      });

    if (
      appointments.length === 0
    ) {
      throw new NotFoundException(
        'No appointments found',
      );
    }

    return appointments;
  }
}