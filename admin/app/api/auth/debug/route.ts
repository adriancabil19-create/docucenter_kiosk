import { NextResponse } from 'next/server';

// Temporary — remove after confirming env vars are set
export async function GET() {
  return NextResponse.json({
    ADMIN_USERNAME_set: !!process.env.ADMIN_USERNAME,
    ADMIN_USERNAME_length: process.env.ADMIN_USERNAME?.length ?? 0,
    ADMIN_PASSWORD_set: !!process.env.ADMIN_PASSWORD,
    ADMIN_PASSWORD_length: process.env.ADMIN_PASSWORD?.length ?? 0,
    SESSION_SECRET_set: !!process.env.SESSION_SECRET,
  });
}
