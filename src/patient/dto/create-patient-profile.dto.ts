import {
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePatientProfileDto {
  @IsString()
  fullName: string;

  @IsInt()
  @Min(0)
  age: number;

  @IsString()
  gender: string;

  @IsString()
  contactDetails: string;

  @IsOptional()
  @IsString()
  healthInformation?: string;
}