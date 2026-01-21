import { PrismaClient } from "@prisma/client";

// Use a global variable to prevent multiple Prisma instances in dev
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export class ConfigService {
    async get(key: string): Promise<string | null> {
        const config = await prisma.appConfig.findUnique({
            where: { key },
        });
        return config?.value || null;
    }

    async getAll(): Promise<Record<string, string>> {
        const configs = await prisma.appConfig.findMany();
        return configs.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {} as Record<string, string>);
    }

    async set(key: string, value: string, isSecret = false): Promise<void> {
        await prisma.appConfig.upsert({
            where: { key },
            update: { value, isSecret },
            create: { key, value, isSecret },
        });
    }

    async delete(key: string): Promise<void> {
        await prisma.appConfig.delete({
            where: { key }
        });
    }
}

export const configService = new ConfigService();
