/**
 * reset-password.js  –  Dev utility to reset a user's password
 *
 * Run from the server folder:
 *   node reset-password.js                        ← list all users
 *   node reset-password.js <email> <newpassword>  ← reset password
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('./models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medical_assistance';

mongoose.connect(MONGO_URI).catch(err => {
  console.error('Could not connect to MongoDB:', err.message);
  process.exit(1);
});

async function run() {
  const [,, email, newPassword] = process.argv;

  // ── List all users ────────────────────────────────────────────
  if (!email) {
    const users = await User.find({}, 'fullName email role').lean();
    if (!users.length) {
      console.log('No users found in the database.');
    } else {
      console.log('\n  All registered users:\n');
      console.log('  ' + '─'.repeat(72));
      console.log(`  ${'Full Name'.padEnd(25)} ${'Email'.padEnd(32)} Role`);
      console.log('  ' + '─'.repeat(72));
      users.forEach(u => {
        console.log(`  ${(u.fullName || '').padEnd(25)} ${u.email.padEnd(32)} ${u.role}`);
      });
      console.log('  ' + '─'.repeat(72));
      console.log('\n  To reset a password run:');
      console.log('  node reset-password.js <email> <newpassword>\n');
    }
    mongoose.disconnect();
    return;
  }

  // ── Reset password ────────────────────────────────────────────
  if (!newPassword) {
    console.error('Provide a new password: node reset-password.js <email> <newpassword>');
    mongoose.disconnect();
    return;
  }

  if (newPassword.length < 6) {
    console.error('Password must be at least 6 characters.');
    mongoose.disconnect();
    return;
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    mongoose.disconnect();
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await User.updateOne({ _id: user._id }, { password: hash });

  console.log(`\n  Password reset successfully!`);
  console.log(`  Name        : ${user.fullName}`);
  console.log(`  Email       : ${user.email}`);
  console.log(`  Role        : ${user.role}`);
  console.log(`  New password: ${newPassword}\n`);

  mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
