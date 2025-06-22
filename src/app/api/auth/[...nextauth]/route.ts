import NextAuth, { SessionStrategy } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient } from "../../../../generated/prisma";

const prisma = new PrismaClient();

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
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 