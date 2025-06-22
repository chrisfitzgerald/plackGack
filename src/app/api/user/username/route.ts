import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '../../auth/[...nextauth]/route';
import prisma from '@/prisma';

// POST: Set username if unique
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { username } = await req.json();
  if (!username || typeof username !== 'string' || username.length < 3) {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }
  // Check if username is taken
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: 'Username taken' }, { status: 409 });
  }
  // Set username for current user
  const user = await prisma.user.update({
    where: { email: session.user.email },
    data: { username },
  });
  return NextResponse.json({ success: true, user: { id: user.id, username: user.username } });
}

// GET: Check if username exists
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');
  if (!username) {
    return NextResponse.json({ error: 'No username provided' }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  return NextResponse.json({ exists: !!existing });
} 