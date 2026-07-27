/*
  Warnings:

  - You are about to drop the column `slotDuration` on the `DoctorProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DoctorProfile" DROP COLUMN "slotDuration",
ADD COLUMN     "waveDuration" INTEGER;
