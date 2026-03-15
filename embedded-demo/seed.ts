import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { faker } from "@faker-js/faker";

const adapter = new PrismaBetterSqlite3({ url: "./demo.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  await prisma.post.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const categories = await Promise.all([
    prisma.category.create({ data: { name: "Technology" } }),
    prisma.category.create({ data: { name: "Travel" } }),
    prisma.category.create({ data: { name: "Food" } }),
    prisma.category.create({ data: { name: "Lifestyle" } }),
  ]);

  for (let i = 0; i < 10; i++) {
    const user = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        name: faker.person.fullName(),
        profile: {
          create: {
            bio: faker.lorem.paragraph(),
            website: faker.internet.url(),
          },
        },
        posts: {
          create: Array.from({
            length: faker.number.int({ min: 1, max: 5 }),
          }).map(() => ({
            title: faker.lorem.sentence(),
            content: faker.lorem.paragraphs(3),
            published: faker.datatype.boolean(),
            categories: {
              connect: faker.helpers
                .arrayElements(categories, { min: 1, max: 2 })
                .map((cat) => ({ id: cat.id })),
            },
          })),
        },
      },
    });
    console.log(`✓ Created user: ${user.email}`);
  }

  const stats = {
    users: await prisma.user.count(),
    posts: await prisma.post.count(),
    profiles: await prisma.profile.count(),
    categories: await prisma.category.count(),
  };

  console.log("\n📊 Database seeded successfully!");
  console.log(`   Users: ${stats.users}`);
  console.log(`   Posts: ${stats.posts}`);
  console.log(`   Profiles: ${stats.profiles}`);
  console.log(`   Categories: ${stats.categories}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
