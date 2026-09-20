import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PUBLIC_KEY } from "../decorators/permissions.decorator";

/**
 * Domain separation-of-duties (spec §59: clinical visibility ≠ financial
 * access ≠ government-program access). Flat action permissions cannot express
 * "a laboratory technician must never write prescriptions" — every clinical
 * role holds CREATE. This guard adds the missing resource-domain dimension:
 * sensitive resource families are closed to roles that must never act on
 * them, regardless of the generic action they hold.
 *
 * Deliberately conservative: only boundaries with clear patient-safety or
 * financial-integrity rationale are enforced here.
 */

const DOMAIN_BLOCKS: Record<string, RegExp> = {
  // Only clinicians (and admins) write clinical orders/records.
  CLINICAL_WRITE: /^\/api\/v1\/(encounters|admissions|ot|follow-ups|nursing-handovers)/,
  // Dispensing is pharmacy-only.
  PHARMACY_DISPENSE: /^\/api\/v1\/pharmacy\/(dispense|sale)/,
  // Blood-bank clinical decisions are blood-bank staff only.
  BLOOD_BANK: /^\/api\/v1\/(blood-bank|interop\/blood)/,
  // Government programme/eligibility decisions.
  PROGRAMME: /^\/api\/v1\/(regulatory|interop\/(surveillance|vital-events))/,
};

/** Roles allowed to write clinical records/orders. */
const CLINICAL_WRITERS = new Set([
  "PLATFORM_SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
  "DOCTOR",
  "NURSE",
  "WARD_INCHARGE",
  "MIDWIFE",
  "ICU_STAFF",
  "EMERGENCY_STAFF",
  "OT_NURSE",
  "ANESTHETIST",
  "PHYSIOTHERAPIST",
  "MEDICAL_OFFICER",
  "CONSULTANT",
  "SURGEON",
  "MEDICAL_DIRECTOR",
  "DEPARTMENT_HEAD",
]);

const PHARMACY_WRITERS = new Set([
  "PLATFORM_SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
  "PHARMACIST",
  "PHARMACY_ASSISTANT",
]);

const BLOOD_BANK_WRITERS = new Set([
  "PLATFORM_SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
  "BLOOD_BANK_STAFF",
  "PATHOLOGIST",
  "LAB_TECHNICIAN",
  "NURSE",
]);

const PROGRAMME_WRITERS = new Set([
  "PLATFORM_SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
  "QUALITY_MANAGER",
  "IT_ADMIN",
  "AUDITOR",
]);

const DOMAIN_ALLOWED: Record<string, Set<string>> = {
  CLINICAL_WRITE: CLINICAL_WRITERS,
  PHARMACY_DISPENSE: PHARMACY_WRITERS,
  BLOOD_BANK: BLOOD_BANK_WRITERS,
  PROGRAMME: PROGRAMME_WRITERS,
};

const BYPASS_ROLES = new Set([
  "PLATFORM_SUPER_ADMIN",
  "HOSPITAL_ADMIN",
  "HOSPITAL_OWNER",
]);

@Injectable()
export class DomainSeparationGuard implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest();
    const method = request.method as string;
    if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return next.handle();

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return next.handle();

    const user = request.user;
    if (!user || BYPASS_ROLES.has(user.role)) return next.handle();

    const url: string = request.originalUrl || request.url || "";
    for (const [domain, re] of Object.entries(DOMAIN_BLOCKS)) {
      if (re.test(url)) {
        const allowed = DOMAIN_ALLOWED[domain];
        if (allowed && !allowed.has(user.role)) {
          throw new ForbiddenException(
            `Separation of duties: role ${user.role} may not perform ${domain.replace("_", " ").toLowerCase()} operations`,
          );
        }
        break;
      }
    }
    return next.handle();
  }
}
