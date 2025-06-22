# Plack Gack

A retro-style terminal-based Plack Gack game built with Next.js, featuring authentication, leaderboards, and both online and offline modes.

## Features

- **Terminal-style UI**: Retro green text on black background
- **Online Mode**: Google authentication with persistent scores
- **Offline Mode**: Play without authentication
- **Leaderboards**: Track top players and their scores
- **Real-time Gameplay**: Hit, stand, double down, and split options
- **MongoDB Integration**: Persistent data storage

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Game Rules

- Standard Plack Gack rules apply
- Plack Gack pays 3:2
- Dealer hits on soft 17
- Double down and split available
- Starting balance: $100

## Setup

For full setup instructions including database configuration and Google OAuth, see [SETUP.md](./SETUP.md).

## Technologies Used

- [Next.js](https://nextjs.org) - React framework
- [NextAuth.js](https://next-auth.js.org) - Authentication
- [Prisma](https://prisma.io) - Database ORM
- [MongoDB](https://mongodb.com) - Database
- [TypeScript](https://typescriptlang.org) - Type safety

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/getting-started/introduction)
- [Prisma Documentation](https://www.prisma.io/docs)

## Deploy on Vercel

The easiest way to deploy your Plack Gack game is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
