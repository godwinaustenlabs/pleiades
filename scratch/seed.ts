import { getDb, schema } from '@ganova/database';
import { generateId } from './src/utils/id';

async function seed(env: any) {
  const db = getDb(env);
  
  // 1. Create a super-admin role
  const roleId = generateId('role');
  await db.insert(schema.roles).values({
    id: roleId,
    name: 'CEO',
    createdAt: new Date(),
  });

  // 2. Create a default admin user
  const encoder = new TextEncoder();
  const password = 'admin-password';
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
  const passwordHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const userId = generateId('user');
  await db.insert(schema.usersLogins).values({
    id: userId,
    email: 'admin@ganova.os',
    passwordHash,
    roleId: roleId,
    isActive: true,
    createdAt: new Date(),
  });

  console.log('Seed complete!');
  console.log('Email: admin@ganova.os');
  console.log('Password: admin-password');
}
