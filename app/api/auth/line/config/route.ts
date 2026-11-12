import { NextResponse } from 'next/server';
import { lineLoginReady, lineSignupReady } from '@/app/line-auth';
export async function GET() { return NextResponse.json({ login: lineLoginReady(), signup: lineSignupReady() }, { headers: { 'Cache-Control': 'no-store' } }); }
