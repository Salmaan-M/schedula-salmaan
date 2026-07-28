-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED';
