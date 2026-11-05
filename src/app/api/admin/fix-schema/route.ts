import { NextResponse } from 'next/server';

// En Firebase Firestore no hay schema que arreglar (es schemaless)
// Este endpoint era para Appwrite — ahora es un no-op
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Firestore es schemaless — no requiere fix-schema',
    skipped: true,
  });
}

export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Firestore es schemaless — no requiere fix-schema',
    skipped: true,
  });
}
