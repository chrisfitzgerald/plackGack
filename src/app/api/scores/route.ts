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

    const body = await request.json();
    const { balance, totalHands, wins, losses, pushes, blackjacks, bestWinStreak, bestLossStreak, totalBet, mostDrawnCard, fiveCardCharlies } = body;

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
        totalHands: totalHands ?? undefined,
        wins: wins ?? undefined,
        losses: losses ?? undefined,
        pushes: pushes ?? undefined,
        blackjacks: blackjacks ?? undefined,
        bestWinStreak: bestWinStreak ?? undefined,
        bestLossStreak: bestLossStreak ?? undefined,
        totalBet: totalBet ?? undefined,
        mostDrawnCard: mostDrawnCard ?? undefined,
        fiveCardCharlies: fiveCardCharlies ?? undefined,
      },
      create: {
        userId: (session.user as any).id,
        balance,
        totalHands: totalHands ?? 0,
        wins: wins ?? 0,
        losses: losses ?? 0,
        pushes: pushes ?? 0,
        blackjacks: blackjacks ?? 0,
        bestWinStreak: bestWinStreak ?? 0,
        bestLossStreak: bestLossStreak ?? 0,
        totalBet: totalBet ?? 0,
        mostDrawnCard: mostDrawnCard ?? '',
        fiveCardCharlies: fiveCardCharlies ?? 0,
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