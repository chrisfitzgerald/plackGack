import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PrismaClient } from '../../../../generated/prisma';
import { authOptions } from '../../auth/[...nextauth]/route';

const prisma = new PrismaClient();

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

    const result = { 
      currentBalance: userScore?.balance || 100 // Default to 100 if no previous games
    };

    console.log('User balance fetched:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching user balance:', error);
    return NextResponse.json({ error: 'Failed to fetch user balance' }, { status: 500 });
  }
} 