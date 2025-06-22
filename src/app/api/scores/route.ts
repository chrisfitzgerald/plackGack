import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '../../../generated/prisma';
import { authOptions } from '../auth/[...nextauth]/route';

const prisma = new PrismaClient();

// GET /api/scores - Get leaderboard
export async function GET() {
  try {
    const leaderboard = await prisma.gameScore.findMany({
      include: {
        user: {
          select: {
            name: true,
            image: true,
            username: true,
          },
        },
      },
      orderBy: {
        balance: 'desc',
      },
      take: 10,
    });

    return NextResponse.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

// POST /api/scores - Save or update user's balance
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || !(session.user as any).id) {
      console.log('Unauthorized access attempt - no valid session or user ID');
      return NextResponse.json({ error: 'Unauthorized - Please sign in again' }, { status: 401 });
    }

    const { balance } = await request.json();

    if (typeof balance !== 'number') {
      return NextResponse.json({ error: 'Invalid balance' }, { status: 400 });
    }

    console.log(`Upserting balance for user ${(session.user as any).id}: balance=${balance}`);

    // Use upsert to either create a new record or update existing one
    const gameScore = await prisma.gameScore.upsert({
      where: {
        userId: (session.user as any).id,
      },
      update: {
        balance,
        gameDate: new Date(),
      },
      create: {
        userId: (session.user as any).id,
        balance,
      },
      include: {
        user: {
          select: {
            name: true,
            image: true,
            username: true,
          },
        },
      },
    });

    console.log('Balance upserted successfully:', gameScore.id);
    return NextResponse.json(gameScore);
  } catch (error) {
    console.error('Error upserting balance:', error);
    return NextResponse.json({ error: 'Failed to save balance' }, { status: 500 });
  }
} 