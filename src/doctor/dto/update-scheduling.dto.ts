import {
  IsEnum,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { SchedulingType } from '@prisma/client';

export class UpdateSchedulingDto {
  @IsEnum(SchedulingType)
  schedulingType: SchedulingType;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferTime?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  waveDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  waveCapacity?: number;
}