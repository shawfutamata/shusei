import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createAttendanceEvent, getAttendanceData, updateAttendancePerson } from '@/db/data';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  return NextResponse.json(await getAttendanceData(user));
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const meetingDate = clean(body.meetingDate, 10);
  const meetingName = clean(body.meetingName, 80);
  const venue = clean(body.venue, 60);
  const ocrText = clean(body.ocrText, 10000);
  const rawPeople = Array.isArray(body.people) ? body.people.slice(0, 120) : [];
  const people = rawPeople.map((item) => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return { personName: clean(row.personName, 60), company: clean(row.company, 100), note: clean(row.note, 240), isImportant: row.isImportant === true };
  }).filter((person) => person.personName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate) || !meetingName || !venue || people.length === 0) {
    return NextResponse.json({ error: '例会日・例会名・会場と、1名以上の出席者を入力してください。' }, { status: 400 });
  }
  const id = await createAttendanceEvent(user, { meetingDate, meetingName, venue, ocrText, people });
  return NextResponse.json({ id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.json() as Record<string, unknown>;
  const id = clean(body.id, 80);
  const personName = clean(body.personName, 60);
  const company = clean(body.company, 100);
  const note = clean(body.note, 240);
  const isImportant = body.isImportant === true;
  if (!id || !personName) return NextResponse.json({ error: 'お名前を入力してください。' }, { status: 400 });
  try {
    await updateAttendancePerson(user, { id, personName, company, note, isImportant });
    return NextResponse.json({ id, personName, company, note, isImportant });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '更新できませんでした。' }, { status: 400 });
  }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
