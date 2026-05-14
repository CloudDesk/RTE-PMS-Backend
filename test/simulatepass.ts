
import argon2 from 'argon2';

const plainPassword = 'Passcode';
const storedHash = '$argon2id$v=19$m=65536,t=3,p=4$yh/1AhsZ2Nmy6RGGp5EGAg$xSnqmCCZIftoicrPM/FAw0DyX+CTbp7QZPAa49VmVU8';


async function testPasswordVerification() {
  try {
    console.log('Plain password being verified:', plainPassword);
    console.log('Stored hash from DB:', storedHash);
    const isValidPassword = await argon2.verify(storedHash, plainPassword);
    console.log('Password Verification Result:', isValidPassword);

  } catch (error) {
    console.error('Error during password testing:', error);
  }
}

testPasswordVerification();
