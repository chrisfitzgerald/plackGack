import NextAuth, { SessionStrategy } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "../../../../generated/prisma";

const prisma = new PrismaClient();

// Debug database state
console.log('=== Database Debug ===');
prisma.session.count().then(count => {
  console.log('Total sessions in DB:', count);
});
prisma.user.count().then(count => {
  console.log('Total users in DB:', count);
});
prisma.account.count().then(count => {
  console.log('Total accounts in DB:', count);
});

// Check for expired sessions
prisma.session.findMany({
  where: {
    expires: {
      lt: new Date() // Sessions that have expired
    }
  }
}).then(expiredSessions => {
  console.log('Expired sessions:', expiredSessions.length);
  if (expiredSessions.length > 0) {
    console.log('Expired session IDs:', expiredSessions.map(s => s.id));
  }
});

// Clean up expired sessions
console.log('=== Cleaning up expired sessions ===');
prisma.session.deleteMany({
  where: {
    expires: {
      lt: new Date()
    }
  }
}).then(result => {
  console.log('Deleted expired sessions:', result.count);
}).catch(err => {
  console.error('Error deleting expired sessions:', err);
});

console.log('=====================================');

// Debug logging
console.log('=== NextAuth Configuration ===');
console.log('GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('NEXTAUTH_SECRET exists:', !!process.env.NEXTAUTH_SECRET);
console.log('NEXTAUTH_URL:', process.env.NEXTAUTH_URL || 'http://localhost:3000');
console.log('===============================');

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt" as SessionStrategy,
  },
  jwt: {
    secret: process.env.NEXTAUTH_SECRET,
  },
  callbacks: {
    session: async ({ session, token }: { session: any; token: any }) => {
      if (session?.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    jwt: async ({ token, user }: { token: any; user: any }) => {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  pages: {
    signIn: '/',
  },
  debug: true,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
