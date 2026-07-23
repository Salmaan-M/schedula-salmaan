import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateDoctorProfileDto {
  @IsString()
  fullName: string;

  @IsString()
  specialization: string;

  @IsInt()
  @Min(0)
  experience: number;

  @IsString()
  qualification: string;

  @IsNumber()
  @Min(0)
  consultationFee: number;

  @IsString()
  availability: string;

  @IsOptional()
  @IsString()
  profileDetails?: string;
}