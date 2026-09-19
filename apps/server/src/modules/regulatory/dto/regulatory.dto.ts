import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

const ROUNDING_MODES = ["FLOOR", "CEIL", "ROUND"] as const;
const SSU_DECISIONS = ["APPROVED", "REJECTED"] as const;
const VIP_ACTIONS = ["VIEW", "PRINT", "EXPORT"] as const;

export class CreateRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ruleKey!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ruleName!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  authority?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  legalReference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ruleType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  eligibilityExpression?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  benefitExpression?: string;

  @ApiProperty()
  @IsObject()
  config!: unknown;

  @ApiProperty()
  @IsDateString({}, { message: "effectiveFrom must be an ISO 8601 date" })
  effectiveFrom!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString({}, { message: "effectiveTo must be an ISO 8601 date" })
  effectiveTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  approvedBy?: string;
}

export class AssignFreeBedDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  encounterId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  admissionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  bedId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  eligibilityBasis!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  verificationDocRef?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  verificationAuthority?: string;
}

export class CreateSsuAssessmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  encounterId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  economicTier!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  diseaseCategory!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  treatmentCategory?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  householdIncome?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  assessmentNotes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  documents?: unknown[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  recommendedSubsidy?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  totalBillAmount?: number;
}

export class DecideSsuDto {
  @ApiProperty({ enum: SSU_DECISIONS })
  @IsIn(SSU_DECISIONS)
  decision!: "APPROVED" | "REJECTED";

  @ApiProperty({ type: [Object], required: false })
  @IsOptional()
  @IsArray()
  members?: Array<{ userId: string; name?: string }>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  approvedAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  governmentContribution?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  hospitalContribution?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  patientContribution?: number;
}

export class CreateBipannaCaseDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  diseaseCategory!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  diagnosis?: string;
}

export class AmountDto {
  @ApiProperty()
  @IsNumber()
  amount!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class SettleBipannaDto {
  @ApiProperty()
  @IsNumber()
  approvedClaim!: number;

  @ApiProperty()
  @IsNumber()
  received!: number;

  @ApiProperty()
  @IsNumber()
  rejected!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  claimId?: string;
}

export class StartBrainDeathDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  admissionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  encounterId?: string;
}

export class BrainDeathStepDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  step?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class EnqueueSeniorDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  servicePoint!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  encounterId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString({}, { message: "dateOfBirth must be an ISO 8601 date" })
  dateOfBirth?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  emergencyTriageLevel?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  overrideReason?: string;
}

export class ClassifyVipDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty()
  @IsIn(["VIP", "VVIP"])
  level!: "VIP" | "VVIP";

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  authorizedBy?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString({}, { message: "effectiveTo must be an ISO 8601 date" })
  effectiveTo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  accessPolicy?: unknown;
}

export class VipAccessDto {
  @ApiProperty({ enum: VIP_ACTIONS, required: false })
  @IsOptional()
  @IsIn(VIP_ACTIONS)
  action?: "VIEW" | "PRINT" | "EXPORT";

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  breakGlass?: boolean;
}