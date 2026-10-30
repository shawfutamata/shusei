import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'WebのログインはGoogleをご利用ください。' }, { status: 403 });
}
