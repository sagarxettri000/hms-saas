import { ApiProperty } from "@nestjs/swagger";
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export class BookAppointmentDto {
  @ApiProperty({ description: "Patient record id" })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ description: "Doctor profile id" })
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @ApiProperty({ description: "Appointment start time (ISO 8601)" })
  @IsDateString({}, { message: "appointmentDate must be a valid ISO 8601 date" })
  appointmentDate!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}