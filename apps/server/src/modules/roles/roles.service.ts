import { Injectable } from "@nestjs/common";
import { UserRole, PermissionAction, getRolePermissions } from "@hms/shared";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateRoleDto {
  name: string;
  description?: string;
  permissions: PermissionAction[];
}

export interface AssignRoleDto {
  userId: string;
  role: UserRole;
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });
  }

  async create(dto: CreateRoleDto) {
    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          name: dto.name as UserRole,
          description: dto.description,
          isSystem: false,
        },
      });

      for (const permission of dto.permissions) {
        const permissionRecord = await tx.permission.upsert({
          where: { name: permission },
          create: { name: permission },
          update: {},
        });

        await tx.rolePermission.create({
          data: {
            roleId: created.id,
            permissionId: permissionRecord.id,
          },
        });
      }

      return created;
    });

    return role;
  }

  async update(id: string, dto: Partial<CreateRoleDto>) {
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id },
        data: { description: dto.description },
      });

      if (dto.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });

        for (const permission of dto.permissions) {
          const permissionRecord = await tx.permission.upsert({
            where: { name: permission },
            create: { name: permission },
            update: {},
          });

          await tx.rolePermission.create({
            data: {
              roleId: id,
              permissionId: permissionRecord.id,
            },
          });
        }
      }

      return role;
    });
  }

  async remove(id: string) {
    return this.prisma.role.delete({ where: { id } });
  }

  async getRolePermissions(role: UserRole) {
    return getRolePermissions(role);
  }

  async listAvailableRoles() {
    return Object.values(UserRole).map((role) => ({
      name: role,
      label: role.replace(/_/g, " "),
      permissions: getRolePermissions(role),
    }));
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { name: "asc" },
    });
  }
}
