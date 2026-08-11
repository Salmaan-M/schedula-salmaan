-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'BOOKED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Slot" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Slot_appointmentId_key" ON "Slot"("appointmentId");

-- CreateIndex
CREATE INDEX "Slot_doctorId_idx" ON "Slot"("doctorId");

-- CreateIndex
CREATE INDEX "Slot_date_idx" ON "Slot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_doctorId_date_startTime_endTime_key" ON "Slot"("doctorId", "date", "startTime", "endTime");

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
