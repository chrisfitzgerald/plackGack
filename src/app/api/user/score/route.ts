import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/prisma';
import { authOptions } from '../../auth/[...nextauth]/route';

// GET /api/user/score - Get current user's balance
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user || !(session.user as any).id) {
      console.log('Unauthorized access attempt - no valid session or user ID');
      return NextResponse.json({ error: 'Unauthorized - Please sign in again' }, { status: 401 });
    }

    console.log(`Fetching balance for user ${(session.user as any).id}`);

    // Get the user's score record (there's only one per user now)
    const userScore = await prisma.gameScore.findUnique({
      where: {
        userId: (session.user as any).id,
      },
    });

    // Also fetch the user's username
    const user = await prisma.user.findUnique({
      where: { id: (session.user as any).id },
      select: { username: true },
    });

    const result = { 
      currentBalance: userScore?.balance || 100, // Default to 100 if no previous games
      user: { username: user?.username },
      totalHands: userScore?.totalHands ?? 0,
      wins: userScore?.wins ?? 0,
      losses: userScore?.losses ?? 0,
      pushes: userScore?.pushes ?? 0,
      blackjacks: userScore?.blackjacks ?? 0,
      bestWinStreak: userScore?.bestWinStreak ?? 0,
      bestLossStreak: userScore?.bestLossStreak ?? 0,
      totalBet: userScore?.totalBet ?? 0,
      mostDrawnCard: userScore?.mostDrawnCard ?? '',
      fiveCardCharlies: userScore?.fiveCardCharlies ?? 0,
    };

    console.log('User balance fetched:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching user balance:', error);
    return NextResponse.json({ error: 'Failed to fetch user balance' }, { status: 500 });
  }
} 