import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateAccountDto {
  code: string;
  name: string;
  type: string;
  parentId?: string;
  description?: string;
}

export interface CreateJournalEntryDto {
  date?: Date | string;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  lines: {
    accountId: string;
    debit?: number;
    credit?: number;
    notes?: string;
  }[];
}

export interface OpenCashSessionDto {
  openingCash?: number;
  notes?: string;
}

export interface CreateHandoverDto {
  cashSessionId: string;
  toUserId: string;
  amount: number;
  method?: string;
  referenceNumber?: string;
  notes?: string;
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  private stripProtected<T extends object>(dto: T): Partial<T> {
    const clean = { ...dto };
    delete (clean as any).tenantId;
    delete (clean as any).id;
    delete (clean as any).createdAt;
    delete (clean as any).updatedAt;
    return clean;
  }

  // ---------- Chart of accounts ----------

  async findAccounts(tenantId: string, type?: string) {
    return this.prisma.account.findMany({
      where: { tenantId, ...(type ? { type } : {}) },
      orderBy: { code: "asc" },
    });
  }

  async createAccount(tenantId: string, dto: CreateAccountDto) {
    if (!dto.code || !String(dto.code).trim())
      throw new BadRequestException("Account code is required");
    if (!dto.name || !String(dto.name).trim())
      throw new BadRequestException("Account name is required");
    const existing = await this.prisma.account.findUnique({
      where: { tenantId_code: { tenantId, code: dto.code } },
    });
    if (existing)
      throw new BadRequestException(
        `Account with code ${dto.code} already exists`,
      );
    return this.prisma.account.create({
      data: { tenantId, ...this.stripProtected(dto) } as any,
    });
  }

  async updateAccount(
    tenantId: string,
    id: string,
    dto: Partial<CreateAccountDto>,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId },
    });
    if (!account) throw new NotFoundException("Account not found");
    return this.prisma.account.update({
      where: { id },
      data: this.stripProtected(dto) as any,
    });
  }

  // ---------- Journal entries ----------

  async createJournalEntry(
    tenantId: string,
    dto: CreateJournalEntryDto,
    userId?: string,
  ) {
    if (!dto.lines || dto.lines.length < 2) {
      throw new BadRequestException(
        "A journal entry requires at least 2 lines",
      );
    }

    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of dto.lines) {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
        throw new BadRequestException("Debit and credit must be valid numbers");
      }
      if (debit < 0 || credit < 0)
        throw new BadRequestException("Debit and credit cannot be negative");
      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new BadRequestException(
          "Each journal line must have exactly one of debit or credit, and it must be non-zero",
        );
      }
      totalDebit += debit;
      totalCredit += credit;
      const account = await this.prisma.account.findFirst({
        where: { id: line.accountId, tenantId },
      });
      if (!account)
        throw new NotFoundException(`Account ${line.accountId} not found`);
    }

    if (totalDebit === 0 || Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new BadRequestException(
        `Journal entry not balanced (debit ${totalDebit} vs credit ${totalCredit})`,
      );
    }

    const entryNumber = await this.generateEntryNumber(tenantId);

    return this.prisma.journalEntry.create({
      data: {
        tenantId,
        entryNumber,
        date: dto.date ? new Date(dto.date) : undefined,
        description: dto.description,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        createdBy: userId,
        lines: {
          create: dto.lines.map((l) => ({
            tenantId,
            accountId: l.accountId,
            debit: l.debit || 0,
            credit: l.credit || 0,
            notes: l.notes,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async findJournalEntries(
    tenantId: string,
    query: { from?: string; to?: string; page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = { tenantId };
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        to.setHours(23, 59, 59, 999);
        where.date.lte = to;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: { include: { account: true } } },
        orderBy: { date: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getTrialBalance(tenantId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId },
    });
    const result = [];
    for (const account of accounts) {
      const agg = await this.prisma.journalLine.aggregate({
        where: { accountId: account.id },
        _sum: { debit: true, credit: true },
      });
      result.push({
        code: account.code,
        name: account.name,
        type: account.type,
        debit: Number(agg._sum.debit || 0),
        credit: Number(agg._sum.credit || 0),
      });
    }
    return result;
  }

  // ---------- Cash sessions ----------

  async openCashSession(
    tenantId: string,
    dto: OpenCashSessionDto,
    userId: string,
  ) {
    const existing = await this.prisma.cashSession.findFirst({
      where: { tenantId, userId, status: "OPEN" },
    });
    if (existing)
      throw new BadRequestException("A cash session is already open");

    const openingCash = Number(dto.openingCash ?? 0);
    if (!Number.isFinite(openingCash) || openingCash < 0)
      throw new BadRequestException("Opening cash must be a non-negative number");

    return this.prisma.cashSession.create({
      data: {
        tenantId,
        userId,
        openingCash,
        status: "OPEN",
        notes: dto.notes,
      },
    });
  }

  async closeCashSession(
    tenantId: string,
    id: string,
    dto: { closingCash?: number },
    userId: string,
  ) {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, tenantId },
    });
    if (!session) throw new NotFoundException("Cash session not found");
    if (session.status === "CLOSED")
      throw new BadRequestException("Cash session already closed");

    if (dto.closingCash === undefined || dto.closingCash === null)
      throw new BadRequestException("Closing cash is required");
    const closingCash = Number(dto.closingCash);
    if (!Number.isFinite(closingCash) || closingCash < 0)
      throw new BadRequestException(
        "Closing cash must be a valid non-negative number",
      );
    const expectedCash = await this.calculateExpectedCash(
      tenantId,
      Number(session.openingCash),
      session.openedAt,
    );

    return this.prisma.cashSession.update({
      where: { id },
      data: {
        closingCash,
        expectedCash,
        difference: Number((closingCash - expectedCash).toFixed(2)),
        status: "CLOSED",
        closedAt: new Date(),
      },
    });
  }

  async findCashSessions(tenantId: string, userId?: string) {
    return this.prisma.cashSession.findMany({
      where: { tenantId, ...(userId ? { userId } : {}) },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { openedAt: "desc" },
    });
  }

  // ---------- Handovers ----------

  async createHandover(
    tenantId: string,
    dto: CreateHandoverDto,
    fromUserId: string,
  ) {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: dto.cashSessionId, tenantId },
    });
    if (!session) throw new NotFoundException("Cash session not found");
    if (session.status !== "OPEN")
      throw new BadRequestException("Cash session is not open");

    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException("Handover amount must be a positive number");

    const recipient = await this.prisma.user.findFirst({
      where: { id: dto.toUserId, tenantId },
    });
    if (!recipient)
      throw new BadRequestException("Recipient user not found in this tenant");

    return this.prisma.cashHandover.create({
      data: {
        tenantId,
        cashSessionId: dto.cashSessionId,
        fromUserId,
        toUserId: dto.toUserId,
        amount,
        method: (dto.method || "CASH") as any,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
      },
    });
  }

  async confirmHandover(tenantId: string, id: string, toUserId: string) {
    const handover = await this.prisma.cashHandover.findFirst({
      where: { id, tenantId },
    });
    if (!handover) throw new NotFoundException("Handover not found");
    if (handover.toUserId !== toUserId)
      throw new BadRequestException("Only the recipient can confirm");
    if (handover.confirmedAt)
      throw new BadRequestException("Handover already confirmed");

    return this.prisma.cashHandover.update({
      where: { id },
      data: { confirmedAt: new Date(), confirmedBy: toUserId },
    });
  }

  async findHandovers(tenantId: string) {
    return this.prisma.cashHandover.findMany({
      where: { tenantId },
      orderBy: { handoverAt: "desc" },
    });
  }

  private async calculateExpectedCash(
    tenantId: string,
    openingCash: number,
    since: Date,
  ): Promise<number> {
    const sinceGte = { paidAt: { gte: since } } as any;
    const cashPayments = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        method: "CASH",
        status: "COMPLETED",
        ...sinceGte,
      },
      _sum: { amount: true },
    });
    const cashRefunds = await this.prisma.refund.aggregate({
      where: {
        tenantId,
        refundMethod: "CASH",
        status: "COMPLETED",
        refundedAt: { gte: since },
      },
      _sum: { amount: true },
    });
    const cashDeposits = await this.prisma.deposit.aggregate({
      where: {
        tenantId,
        method: "CASH",
        receivedAt: { gte: since },
      },
      _sum: { amount: true },
    });

    return Number(
      (
        Number(openingCash) +
        Number(cashPayments._sum.amount || 0) +
        Number(cashDeposits._sum.amount || 0) -
        Number(cashRefunds._sum.amount || 0)
      ).toFixed(2),
    );
  }

  private async generateEntryNumber(tenantId: string): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const latest = await this.prisma.journalEntry.findFirst({
      where: { tenantId, entryNumber: { startsWith: `JE-${ymd}` } },
      orderBy: { createdAt: "desc" },
      select: { entryNumber: true },
    });
    let seq = 1;
    if (latest) {
      const parts = latest.entryNumber.split("-");
      seq = parseInt(parts[parts.length - 1], 10) + 1;
    }
    return `JE-${ymd}-${String(seq).padStart(4, "0")}`;
  }
}
