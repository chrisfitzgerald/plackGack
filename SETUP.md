# Plack Gack Game Setup Guide

This guide will help you set up the Plack Gack game locally.

## Prerequisites

- Node.js (version 18 or higher)
- npm or yarn
- MongoDB Atlas account (for online features)

## Setup Steps

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd plack-gack
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/plackgack?retryWrites=true&w=majority"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Google OAuth (for online features)
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### 3. Database Setup

1. Create a MongoDB Atlas cluster
2. Create a database user with read/write permissions
3. Get your connection string and update the `DATABASE_URL` in `.env.local`
4. Add `/plackgack` to the end of the URL (before the query parameters)

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs
6. Copy Client ID and Client Secret to `.env.local`

### 5. Database Schema

The game uses Prisma with the following schema:

```prisma
model Score {
  id        String   @id @default(cuid())
  balance   Int
  gameDate  DateTime @default(now())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
}

model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  image     String?
  scores    Score[]
}
```

### 6. Run Database Migrations

```bash
npx prisma generate
npx prisma db push
```

### 7. Start Development Server

```bash
npm run dev
```

The game will be available at `http://localhost:3000`

## Game Features

### Offline Mode
- Play without authentication
- Local balance tracking
- No data persistence

### Online Mode
- Google authentication
- Persistent balance across sessions
- Leaderboard integration
- Score tracking

## Game Rules

- Standard Plack Gack rules apply
- Plack Gack pays 3:2
- Dealer hits on soft 17
- Double down and split available
- Insurance not implemented

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

Update `NEXTAUTH_URL` to your production domain and deploy using your preferred platform. 