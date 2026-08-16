import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateEnquiryDto {
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  subject?: string;
  message?: string;
  assignedTo?: string;
  nextFollowUpAt?: Date | string;
  notes?: string;
}

export interface CreateTourismCaseDto {
  patientId?: string;
  enquiryId?: string;
  country?: string;
  language?: string;
  passportNumber?: string;
  treatmentInquiry?: string;
  estimatedCost?: number;
  status?: string;
  visaStatus?: string;
  accommodation?: string;
  transport?: string;
  concierge?: string;
  assignedTo?: string;
}

export interface CreateBlogPostDto {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
  authorId?: string;
  category?: string;
  featuredImage?: string;
  seoTitle?: string;
  metaDescription?: string;
  status?: string;
  scheduledAt?: Date | string;
}

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Enquiries ----------

  async findEnquiries(
    tenantId: string,
    query: { status?: string; page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = { tenantId };
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.enquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.enquiry.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createEnquiry(tenantId: string, dto: CreateEnquiryDto) {
    return this.prisma.enquiry.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        source: dto.source,
        subject: dto.subject,
        message: dto.message,
        assignedTo: dto.assignedTo,
        nextFollowUpAt: dto.nextFollowUpAt
          ? new Date(dto.nextFollowUpAt)
          : undefined,
        notes: dto.notes,
      },
    });
  }

  async updateEnquiry(
    tenantId: string,
    id: string,
    dto: Partial<CreateEnquiryDto>,
  ) {
    const enquiry = await this.prisma.enquiry.findFirst({
      where: { id, tenantId },
    });
    if (!enquiry) throw new NotFoundException("Enquiry not found");
    return this.prisma.enquiry.update({
      where: { id },
      data: {
        ...dto,
        nextFollowUpAt: dto.nextFollowUpAt
          ? new Date(dto.nextFollowUpAt)
          : undefined,
      },
    });
  }

  async convertEnquiry(tenantId: string, id: string, patientId: string) {
    const enquiry = await this.prisma.enquiry.findFirst({
      where: { id, tenantId },
    });
    if (!enquiry) throw new NotFoundException("Enquiry not found");
    return this.prisma.enquiry.update({
      where: { id },
      data: { status: "CONVERTED", convertedToPatientId: patientId },
    });
  }

  // ---------- Medical Tourism ----------

  async findTourismCases(tenantId: string) {
    return this.prisma.medicalTourismCase.findMany({
      where: { tenantId },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, mrn: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createTourismCase(tenantId: string, dto: CreateTourismCaseDto) {
    return this.prisma.medicalTourismCase.create({
      data: { tenantId, ...dto },
    });
  }

  async updateTourismCase(
    tenantId: string,
    id: string,
    dto: Partial<CreateTourismCaseDto>,
  ) {
    const tc = await this.prisma.medicalTourismCase.findFirst({
      where: { id, tenantId },
    });
    if (!tc) throw new NotFoundException("Tourism case not found");
    return this.prisma.medicalTourismCase.update({ where: { id }, data: dto });
  }

  // ---------- Blog ----------

  async findBlogPosts(tenantId: string, status?: string) {
    return this.prisma.blogPost.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      orderBy: { publishedAt: "desc" },
    });
  }

  async createBlogPost(tenantId: string, dto: CreateBlogPostDto) {
    const slug =
      dto.slug ||
      dto.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    const data: any = {
      tenantId,
      title: dto.title,
      slug,
      excerpt: dto.excerpt,
      content: dto.content,
      authorId: dto.authorId,
      category: dto.category,
      featuredImage: dto.featuredImage,
      seoTitle: dto.seoTitle,
      metaDescription: dto.metaDescription,
      status: dto.status || "DRAFT",
    };
    if (dto.status === "PUBLISHED") data.publishedAt = new Date();
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);

    return this.prisma.blogPost.create({ data });
  }

  async updateBlogPost(
    tenantId: string,
    id: string,
    dto: Partial<CreateBlogPostDto>,
  ) {
    const post = await this.prisma.blogPost.findFirst({
      where: { id, tenantId },
    });
    if (!post) throw new NotFoundException("Blog post not found");
    return this.prisma.blogPost.update({ where: { id }, data: dto });
  }
}
